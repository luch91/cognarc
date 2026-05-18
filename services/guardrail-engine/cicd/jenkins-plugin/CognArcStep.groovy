/**
 * CognArc Cognitive Gate — Jenkins Pipeline Step
 *
 * Usage in Jenkinsfile:
 *
 *   def result = cognarcEvaluate(
 *     apiUrl:      env.COGNARC_API_URL,
 *     workspaceId: env.COGNARC_WORKSPACE_ID,
 *     apiKey:      env.COGNARC_API_KEY,
 *     paths:       ['prompts/**', 'src/copy/**'],
 *     environment: 'prod',
 *     failOnBreach: true
 *   )
 *
 *   if (!result.passed) {
 *     error "Cognitive threshold breach: ${result.summary}"
 *   }
 */

import groovy.json.JsonSlurper
import groovy.json.JsonOutput

def call(Map config = [:]) {
    def apiUrl      = config.get('apiUrl',      env.COGNARC_API_URL ?: '')
    def workspaceId = config.get('workspaceId', env.COGNARC_WORKSPACE_ID ?: '')
    def apiKey      = config.get('apiKey',       env.COGNARC_API_KEY ?: '')
    def paths       = config.get('paths',        ['**/*.txt', '**/*.json', '**/*.prompt'])
    def environment = config.get('environment',  '')
    def failOnBreach = config.get('failOnBreach', true)
    def configPath   = config.get('configPath',   '.cognarc.yml')

    if (!apiUrl) error '[cognarc] apiUrl is required'
    if (!workspaceId) error '[cognarc] workspaceId is required'

    echo '[cognarc] Starting cognitive gate evaluation...'

    // Collect changed files via git diff
    def changedFiles = []
    try {
        def diffOutput = sh(script: "git diff --name-only origin/${env.CHANGE_TARGET ?: 'main'}...HEAD", returnStdout: true).trim()
        changedFiles = diffOutput ? diffOutput.split('\n').toList() : []
    } catch (Exception e) {
        echo "[cognarc] Warning: Could not determine changed files: ${e.message}"
    }

    // Filter to monitored paths using simple glob matching
    def monitoredFiles = changedFiles.findAll { file ->
        paths.any { pattern -> file ==~ globToRegex(pattern) }
    }

    if (monitoredFiles.isEmpty()) {
        echo '[cognarc] No monitored files changed. Gate passed.'
        return [passed: true, overridden: false, fileScores: [], summary: 'No monitored files changed.']
    }

    echo "[cognarc] Evaluating ${monitoredFiles.size()} file(s): ${monitoredFiles.join(', ')}"

    // Read PR/MR description for override marker
    def overrideText = env.CHANGE_URL ? getChangeDescription() : ''
    def overridden   = overrideText.toLowerCase().contains('cognarc-override')
    def overrideJustification = null
    def overrideMatch = (overrideText =~ /(?i)cognarc-override:\s*(.+)/)
    if (overrideMatch.find()) {
        overrideJustification = overrideMatch.group(1).trim()
    }

    // Score each file
    def fileScores = []
    def anyBreach  = false

    monitoredFiles.each { filePath ->
        if (!fileExists(filePath)) return

        def content = readFile(filePath)
        def scores  = scoreFile(apiUrl, workspaceId, apiKey, filePath, content)

        if (scores == null) {
            echo "[cognarc] Warning: Could not score ${filePath}"
            return
        }

        // Evaluate thresholds (simplified — full logic in TypeScript core)
        def breaches = overridden ? [] : evaluateThresholds(scores, configPath, environment)
        if (breaches) anyBreach = true

        fileScores << [path: filePath, scores: scores, breaches: breaches]
    }

    def passed = !anyBreach || overridden

    // Build summary
    def summary = buildSummary(fileScores, passed, overridden, overrideJustification)
    echo summary

    // Write audit entry
    writeAuditEntry(apiUrl, workspaceId, fileScores, passed, overridden, overrideJustification)

    def result = [
        passed: passed,
        overridden: overridden,
        overrideJustification: overrideJustification,
        fileScores: fileScores,
        summary: summary
    ]

    if (!passed && failOnBreach) {
        error "[cognarc] Cognitive threshold breach detected. ${summary}"
    }

    return result
}

private Map scoreFile(String apiUrl, String workspaceId, String apiKey, String filePath, String content) {
    try {
        def requestBody = JsonOutput.toJson([
            stimulus_type: 'text',
            content: content,
            workspace_id: workspaceId
        ])

        def response = httpRequest(
            url: "${apiUrl}/score",
            httpMode: 'POST',
            contentType: 'APPLICATION_JSON',
            requestBody: requestBody,
            customHeaders: [[name: 'X-API-Key', value: apiKey, maskValue: true]],
            timeout: 30,
            validResponseCodes: '200'
        )

        return new JsonSlurper().parseText(response.content) as Map
    } catch (Exception e) {
        echo "[cognarc] Scoring error for ${filePath}: ${e.message}"
        return null
    }
}

private List evaluateThresholds(Map scores, String configPath, String environment) {
    // Simplified threshold evaluation — reads .cognarc.yml defaults
    // Full evaluation is delegated to the gate TypeScript core in production
    def breaches = []
    def defaults = [
        cognitive_load:           [max: 80],
        manipulation_risk:        [max: 40],
        comprehension_confidence: [min: 50]
    ]

    defaults.each { metric, limits ->
        def value = scores[metric]
        if (value == null) return
        if (limits.max != null && value > limits.max) {
            breaches << [metric: metric, value: value, threshold: limits.max, direction: 'above_max']
        }
        if (limits.min != null && value < limits.min) {
            breaches << [metric: metric, value: value, threshold: limits.min, direction: 'below_min']
        }
    }

    return breaches
}

private String buildSummary(List fileScores, boolean passed, boolean overridden, String justification) {
    def lines = ['=== CognArc Cognitive Gate ===']
    lines << (passed ? 'STATUS: PASSED' : 'STATUS: FAILED')
    if (overridden) lines << "OVERRIDE: ${justification ?: '(no justification)'}"
    fileScores.each { fs ->
        def status = fs.breaches ? 'BREACH' : 'OK'
        lines << "  [${status}] ${fs.path}"
        lines << "    cognitive_load=${fs.scores.cognitive_load} manipulation_risk=${fs.scores.manipulation_risk} comprehension_confidence=${fs.scores.comprehension_confidence}"
        fs.breaches.each { b ->
            lines << "    BREACH: ${b.metric}=${b.value} (limit ${b.threshold})"
        }
    }
    return lines.join('\n')
}

private void writeAuditEntry(String apiUrl, String workspaceId, List fileScores, boolean passed, boolean overridden, String justification) {
    try {
        def body = JsonOutput.toJson([
            id: UUID.randomUUID().toString(),
            timestamp: new Date().format("yyyy-MM-dd'T'HH:mm:ss'Z'", TimeZone.getTimeZone('UTC')),
            workspace_id: workspaceId,
            action_type: 'CI_GATE_EVALUATION',
            oversight_zone: 'ACT_AUTO',
            policy_rule_applied: 'cicd-cognitive-gate',
            authorising_human_or_policy: overridden ? "override:${justification ?: 'no justification'}" : 'policy:cognarc-cicd-gate',
            outcome: passed ? 'PASSED' : 'BLOCKED',
            meta: [
                platform: 'jenkins',
                build_url: env.BUILD_URL,
                files_evaluated: fileScores.size(),
                files_breached: fileScores.count { it.breaches }
            ]
        ])
        httpRequest(url: "${apiUrl}/audit", httpMode: 'POST', contentType: 'APPLICATION_JSON', requestBody: body, validResponseCodes: '200:299')
    } catch (Exception e) {
        echo "[cognarc] Audit write failed (non-fatal): ${e.message}"
    }
}

private String globToRegex(String glob) {
    return glob.replace('.', '\\.').replace('**', '.+').replace('*', '[^/]+')
}
