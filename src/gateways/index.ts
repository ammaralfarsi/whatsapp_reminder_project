import { config } from "../config";
import { WhatsAppGateway } from "./WhatsAppGateway";
import { WahaGateway } from "./WahaGateway";
import { HaWhatsappGateway } from "./HaWhatsappGateway";
import { GatewayKind } from "../types";

const cache = new Map<GatewayKind, WhatsAppGateway>();

export function getGateway(kind: GatewayKind): WhatsAppGateway {
  const cached = cache.get(kind);
  if (cached) return cached;

  let gw: WhatsAppGateway;
  if (kind === "waha") {
    if (!config.waha.baseUrl) throw new Error("WAHA_BASE_URL is not configured");
    gw = new WahaGateway(config.waha.baseUrl, config.waha.apiKey);
  } else if (kind === "ha-whatsapp") {
    if (!config.haWhatsapp.baseUrl) throw new Error("HA_BASE_URL is not configured");
    gw = new HaWhatsappGateway(config.haWhatsapp.baseUrl, config.haWhatsapp.token, config.haWhatsapp.service);
  } else {
    throw new Error(`Unknown gateway kind: ${kind}`);
  }
  cache.set(kind, gw);
  return gw;
}
