import { handleGateway, type GatewayContext } from '../../cloudflare/gateway.js'

export const onRequest = (context: GatewayContext): Promise<Response> =>
  handleGateway(context, 'score')
