/**
 * PrivacyShield - Entity Normalizer
 * Maps raw model or rule labels to canonical PIIType, tag labels, and risk levels.
 */

import { PIIType, RiskLevel } from "../types.ts";

export class EntityNormalizer {
  public static normalizeType(raw: string): PIIType {
    const lower = raw.toLowerCase().replace(/[-_\s]/g, "_");

    if (lower.includes("email")) return "private_email";
    if (lower.includes("phone") || lower.includes("mobile") || lower.includes("tel"))
      return "private_phone";
    if (lower.includes("person") || lower.includes("name"))
      return "private_person";
    if (lower.includes("address") || lower.includes("street"))
      return "private_address";
    if (lower.includes("pan")) return "pan";
    if (lower.includes("aadhaar") || lower.includes("aadhar") || lower.includes("uid"))
      return "aadhaar";
    if (lower.includes("ifsc")) return "ifsc";
    if (lower.includes("gstin") || lower.includes("gst")) return "gstin";
    if (lower.includes("account")) return "account_number";
    if (lower.includes("credit_card") || lower.includes("card_number"))
      return "credit_card";
    if (lower.includes("token") || lower.includes("jwt") || lower.includes("bearer"))
      return "token";
    if (lower.includes("api_key") || lower.includes("secret") || lower.includes("password"))
      return "secret";
    if (lower.includes("face") || lower.includes("photo") || lower.includes("avatar"))
      return "face";
    if (lower.includes("qr") || lower.includes("qr_code")) return "qr_code";
    if (lower.includes("barcode")) return "barcode";
    if (lower.includes("signature") || lower.includes("sign"))
      return "signature";
    if (lower.includes("roll")) return "roll_number";
    if (lower.includes("registration") || lower.includes("enrollment") || lower.includes("enrol")) return "id_number";
    if (lower.includes("date")) return "private_date";
    if (lower.includes("url")) return "private_url";

    return "unknown";
  }

  public static getTagLabel(type: PIIType): string {
    switch (type) {
      case "private_person":
        return "PRIVATE_PERSON";
      case "private_email":
        return "PRIVATE_EMAIL";
      case "private_phone":
        return "PRIVATE_PHONE";
      case "private_address":
        return "PRIVATE_ADDRESS";
      case "account_number":
        return "ACCOUNT_NUMBER";
      case "pan":
        return "PAN";
      case "ifsc":
        return "IFSC";
      case "aadhaar":
        return "AADHAAR";
      case "gstin":
        return "GSTIN";
      case "secret":
        return "SECRET";
      case "password":
        return "PASSWORD";
      case "api_key":
        return "API_KEY";
      case "token":
        return "SECRET";
      case "face":
        return "FACE";
      case "qr_code":
        return "QR_CODE";
      case "signature":
        return "SIGNATURE";
      case "credit_card":
        return "CREDIT_CARD";
      case "barcode":
        return "BARCODE";
      case "fingerprint":
        return "FINGERPRINT";
      case "roll_number":
        return "ROLL_NUMBER";
      case "id_number":
        return "ID_NUMBER";
      default:
        return "SENSITIVE_DATA";
    }
  }

  public static getRiskLevel(type: PIIType): RiskLevel {
    switch (type) {
      case "secret":
      case "password":
      case "api_key":
      case "token":
      case "credit_card":
        return "critical";

      case "pan":
      case "aadhaar":
      case "ifsc":
      case "account_number":
      case "private_email":
      case "private_phone":
      case "face":
      case "signature":
      case "qr_code":
      case "roll_number":
      case "id_number":
        return "high";

      case "private_person":
      case "private_address":
      case "private_url":
      case "gstin":
        return "medium";

      case "private_date":
      case "barcode":
      case "unknown":
      default:
        return "low";
    }
  }
}
