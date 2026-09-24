/**
 * PrivacyShield - Deterministic Rule Detector
 * High-precision regex and contextual pattern engine for Indian & Global PII.
 */

import { BoundingBox, PIIDetection } from "../types.ts";
import { OCRResult, OCRWord } from "../ocr/OCRNormalizer.ts";

export class RuleDetector {
  public static detectFromOCR(ocr: OCRResult): PIIDetection[] {
    const detections: PIIDetection[] = [];
    const words = ocr.words;
    if (!words || words.length === 0) return detections;

    // Build contiguous text line structures for contextual search
    const lines = this.groupWordsIntoLines(words);

    // Run detectors
    this.detectEmails(words, lines, detections);
    this.detectPhones(words, lines, detections);
    this.detectPANs(words, lines, detections);
    this.detectAadhaars(words, lines, detections);
    this.detectIFSC(words, lines, detections);
    this.detectGSTIN(words, lines, detections);
    this.detectAccountNumbers(words, lines, detections);
    this.detectCustomerAndBankingIds(words, lines, detections);
    this.detectLabeledNames(words, lines, detections);
    this.detectDocumentAddresses(words, lines, detections);
    this.detectRollNumbers(words, lines, detections);
    this.detectRegistrationNumbers(words, lines, detections);
    this.detectSchoolCentreCodes(words, lines, detections);
    this.detectTokensAndSecrets(words, lines, detections);
    this.detectCreditCards(words, lines, detections);

    return detections;
  }

  private static groupWordsIntoLines(words: OCRWord[]): OCRWord[][] {
    const sorted = [...words].sort((a, b) => {
      const yDiff = a.bbox.y0 - b.bbox.y0;
      if (Math.abs(yDiff) > 12) return yDiff;
      return a.bbox.x0 - b.bbox.x0;
    });

    const lines: OCRWord[][] = [];
    let currentLine: OCRWord[] = [];
    let currentY = -999;

    for (const w of sorted) {
      if (currentLine.length === 0) {
        currentLine.push(w);
        currentY = (w.bbox.y0 + w.bbox.y1) / 2;
      } else {
        const midY = (w.bbox.y0 + w.bbox.y1) / 2;
        if (Math.abs(midY - currentY) <= 15) {
          currentLine.push(w);
        } else {
          lines.push(currentLine);
          currentLine = [w];
          currentY = midY;
        }
      }
    }
    if (currentLine.length > 0) lines.push(currentLine);
    return lines;
  }

  private static mergeWordBboxes(words: OCRWord[]): BoundingBox {
    return {
      x0: Math.min(...words.map((w) => w.bbox.x0)),
      y0: Math.min(...words.map((w) => w.bbox.y0)),
      x1: Math.max(...words.map((w) => w.bbox.x1)),
      y1: Math.max(...words.map((w) => w.bbox.y1)),
    };
  }

  // 1. Email Detection
  private static detectEmails(
    words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const emailRegex = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    const broadEmailRegex = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

    for (const w of words) {
      if (emailRegex.test(w.text)) {
        out.push({
          id: `rule-email-${out.length + 1}`,
          type: "private_email",
          source: "rule",
          confidence: 0.99,
          bbox: { ...w.bbox },
          risk: "high",
          action: "mask",
          tagLabel: "PRIVATE_EMAIL",
          token: "<EMAIL_01>",
        });
      }
    }

    // Check multi-word line emails (e.g. rahul . sharma @ example . com)
    for (const line of lines) {
      const lineText = line.map((w) => w.text).join("");
      let match;
      while ((match = broadEmailRegex.exec(lineText)) !== null) {
        // If not already covered
        const matchedStr = match[0];
        const participatingWords = line.filter((w) =>
          matchedStr.includes(w.text.replace(/[@.]/g, ""))
        );
        if (participatingWords.length > 1) {
          const bbox = this.mergeWordBboxes(participatingWords);
          out.push({
            id: `rule-email-multi-${out.length + 1}`,
            type: "private_email",
            source: "rule",
            confidence: 0.98,
            bbox,
            risk: "high",
            action: "mask",
            tagLabel: "PRIVATE_EMAIL",
            token: "<EMAIL_01>",
          });
        }
      }
    }
  }

  // 2. Phone Detection
  private static detectPhones(
    words: OCRWord[],
    _lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const phoneRegex = /^(?:\+?91[\s-]?)?[6-9]\d{9}$/;

    for (let i = 0; i < words.length; i++) {
      const w = words[i];
      const clean = w.text.replace(/[\s()-]/g, "");

      if (phoneRegex.test(clean)) {
        out.push({
          id: `rule-phone-${out.length + 1}`,
          type: "private_phone",
          source: "rule",
          confidence: 0.98,
          bbox: { ...w.bbox },
          risk: "high",
          action: "mask",
          tagLabel: "PRIVATE_PHONE",
          token: "<PHONE_01>",
        });
      } else if ((w.text === "+91" || w.text === "91") && i + 1 < words.length) {
        const nextW = words[i + 1];
        const nextClean = nextW.text.replace(/[\s()-]/g, "");
        if (/^[6-9]\d{9}$/.test(nextClean)) {
          out.push({
            id: `rule-phone-pair-${out.length + 1}`,
            type: "private_phone",
            source: "rule",
            confidence: 0.98,
            bbox: this.mergeWordBboxes([w, nextW]),
            risk: "high",
            action: "mask",
            tagLabel: "PRIVATE_PHONE",
            token: "<PHONE_01>",
          });
          i++; // Skip next
        }
      }
    }
  }

  // 3. Indian PAN Detection: 5 letters, 4 digits, 1 letter (e.g. ABCDE1234F)
  private static detectPANs(
    words: OCRWord[],
    _lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]$/;

    for (const w of words) {
      const clean = w.text.toUpperCase().trim();
      if (panRegex.test(clean)) {
        out.push({
          id: `rule-pan-${out.length + 1}`,
          type: "pan",
          source: "rule",
          confidence: 0.96,
          bbox: { ...w.bbox },
          risk: "high",
          action: "mask",
          tagLabel: "PAN",
          token: "<PAN_01>",
        });
      }
    }
  }

  // 4. Indian Aadhaar Detection: 12 digits
  private static detectAadhaars(
    words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const aadhaar12Regex = /^[2-9]{1}[0-9]{11}$/;

    for (const w of words) {
      const clean = w.text.replace(/\s+/g, "");
      if (aadhaar12Regex.test(clean)) {
        out.push({
          id: `rule-aadhaar-${out.length + 1}`,
          type: "aadhaar",
          source: "rule",
          confidence: 0.97,
          bbox: { ...w.bbox },
          risk: "high",
          action: "mask",
          tagLabel: "AADHAAR",
          token: "<AADHAAR_01>",
        });
      }
    }

    // Multi-word 3 blocks of 4 digits: XXXX XXXX XXXX
    for (const line of lines) {
      for (let i = 0; i <= line.length - 3; i++) {
        const b1 = line[i].text.replace(/\D/g, "");
        const b2 = line[i + 1].text.replace(/\D/g, "");
        const b3 = line[i + 2].text.replace(/\D/g, "");
        if (
          b1.length === 4 &&
          b2.length === 4 &&
          b3.length === 4 &&
          /^[2-9]/.test(b1)
        ) {
          out.push({
            id: `rule-aadhaar-blocks-${out.length + 1}`,
            type: "aadhaar",
            source: "rule",
            confidence: 0.97,
            bbox: this.mergeWordBboxes([line[i], line[i + 1], line[i + 2]]),
            risk: "high",
            action: "mask",
            tagLabel: "AADHAAR",
            token: "<AADHAAR_01>",
          });
          i += 2;
        }
      }
    }
  }

  // 5. IFSC Detection: 4 letters + '0' + 6 alphanumeric (e.g. SBIN0001234)
  private static detectIFSC(
    words: OCRWord[],
    _lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const ifscRegex = /^[A-Z]{4}0[A-Z0-9]{6}$/;

    for (const w of words) {
      const clean = w.text.toUpperCase().trim();
      if (ifscRegex.test(clean)) {
        out.push({
          id: `rule-ifsc-${out.length + 1}`,
          type: "ifsc",
          source: "rule",
          confidence: 0.96,
          bbox: { ...w.bbox },
          risk: "high",
          action: "mask",
          tagLabel: "IFSC",
          token: "<IFSC_01>",
        });
      }
    }
  }

  // 6. GSTIN Detection
  private static detectGSTIN(
    words: OCRWord[],
    _lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
    for (const w of words) {
      const clean = w.text.toUpperCase().trim();
      if (gstinRegex.test(clean)) {
        out.push({
          id: `rule-gstin-${out.length + 1}`,
          type: "gstin",
          source: "rule",
          confidence: 0.96,
          bbox: { ...w.bbox },
          risk: "medium",
          action: "mask",
          tagLabel: "GSTIN",
          token: "<GSTIN_01>",
        });
      }
    }
  }

  // 7. Account Number Detection: 9-18 digits, requiring explicit banking context
  private static detectAccountNumbers(
    _words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const accountContext = /\b(?:account|acct|a\/c|saving|savings|current|khaata|khata)\b/i;

    for (const line of lines) {
      const lineHasContext = line.some((w) => accountContext.test(w.text));
      if (!lineHasContext) continue; // Only flag as account number when banking context is present

      for (const w of line) {
        const clean = w.text.replace(/\D/g, "");
        if (clean.length >= 9 && clean.length <= 18) {
          out.push({
            id: `rule-account-${out.length + 1}`,
            type: "account_number",
            source: "rule",
            confidence: 0.97,
            bbox: { ...w.bbox },
            risk: "high",
            action: "mask",
            tagLabel: "ACCOUNT_NUMBER",
            token: "<ACCOUNT_01>",
          });
        }
      }
    }
  }

  // 8. Roll Number Detection (Hindi & English: अनुक्रमांक / Roll No)
  private static detectRollNumbers(
    words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const rollLabelRegex = /\b(?:roll(?:\s*no|\s*number)?|अनुक्रमांक|रोल\s*नं|रोल\s*नंबर)\b/i;

    // Pattern 1: Same line "Roll No: 24262912"
    for (const line of lines) {
      const labelIndex = line.findIndex((w) => rollLabelRegex.test(w.text));
      if (labelIndex !== -1) {
        for (let i = labelIndex + 1; i < line.length; i++) {
          const w = line[i];
          const clean = w.text.replace(/\D/g, "");
          if (clean.length >= 6 && clean.length <= 12) {
            out.push({
              id: `rule-roll-${out.length + 1}`,
              type: "roll_number",
              source: "rule",
              confidence: 0.98,
              bbox: { ...w.bbox },
              risk: "high",
              action: "mask",
              tagLabel: "ROLL_NUMBER",
              token: "<ROLL_01>",
            });
          }
        }
      }
    }

    // Pattern 2: Vertical table header: Roll number word is directly below the header
    for (const w of words) {
      if (rollLabelRegex.test(w.text)) {
        const midX = (w.bbox.x0 + w.bbox.x1) / 2;
        const candidate = words.find((cw) => {
          const cMidX = (cw.bbox.x0 + cw.bbox.x1) / 2;
          const yDiff = cw.bbox.y0 - w.bbox.y1;
          const clean = cw.text.replace(/\D/g, "");
          return Math.abs(cMidX - midX) < 55 && yDiff > 4 && yDiff < 75 && clean.length >= 6 && clean.length <= 12;
        });
        if (candidate && !out.some((d) => d.bbox.x0 === candidate.bbox.x0 && d.bbox.y0 === candidate.bbox.y0)) {
          out.push({
            id: `rule-roll-vert-${out.length + 1}`,
            type: "roll_number",
            source: "rule",
            confidence: 0.98,
            bbox: { ...candidate.bbox },
            risk: "high",
            action: "mask",
            tagLabel: "ROLL_NUMBER",
            token: "<ROLL_01>",
          });
        }
      }
    }
  }

  // 9. Registration / Enrollment Number Detection (पंजीयन / नामांकन / Registration No)
  private static detectRegistrationNumbers(
    words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const regLabelRegex = /\b(?:registration|enrolment|enrollment|पंजीयन|नामांकन|regn|reg\.?\s*no)\b/i;

    for (const line of lines) {
      const labelIndex = line.findIndex((w) => regLabelRegex.test(w.text));
      if (labelIndex !== -1) {
        for (let i = labelIndex + 1; i < line.length; i++) {
          const w = line[i];
          if (/[A-Za-z0-9]{2,}\/[0-9]{4,}/.test(w.text) || /^[A-Za-z0-9]{6,14}$/.test(w.text)) {
            out.push({
              id: `rule-reg-${out.length + 1}`,
              type: "id_number",
              source: "rule",
              confidence: 0.97,
              bbox: { ...w.bbox },
              risk: "high",
              action: "mask",
              tagLabel: "ID_NUMBER",
              token: "<ID_01>",
            });
          }
        }
      }
    }

    // Vertical table header search
    for (const w of words) {
      if (regLabelRegex.test(w.text)) {
        const midX = (w.bbox.x0 + w.bbox.x1) / 2;
        const candidate = words.find((cw) => {
          const cMidX = (cw.bbox.x0 + cw.bbox.x1) / 2;
          const yDiff = cw.bbox.y0 - w.bbox.y1;
          return Math.abs(cMidX - midX) < 55 && yDiff > 4 && yDiff < 75 &&
            (/[A-Za-z0-9]{2,}\/[0-9]{4,}/.test(cw.text) || /^[A-Za-z0-9]{5,14}$/.test(cw.text));
        });
        if (candidate && !out.some((d) => d.bbox.x0 === candidate.bbox.x0 && d.bbox.y0 === candidate.bbox.y0)) {
          out.push({
            id: `rule-reg-vert-${out.length + 1}`,
            type: "id_number",
            source: "rule",
            confidence: 0.97,
            bbox: { ...candidate.bbox },
            risk: "high",
            action: "mask",
            tagLabel: "ID_NUMBER",
            token: "<ID_01>",
          });
        }
      }
    }
  }

  // 10. School / Centre Code Detection (केंद्र क्रमांक / Centre No)
  private static detectSchoolCentreCodes(
    words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const centreRegex = /\b(?:centre(?:\s*no)?|school(?:\s*no)?|केंद्र|शाला|school\/centre)\b/i;

    for (const line of lines) {
      const idx = line.findIndex((w) => centreRegex.test(w.text));
      if (idx !== -1) {
        for (let i = idx + 1; i < line.length; i++) {
          const w = line[i];
          const clean = w.text.replace(/\D/g, "");
          if (clean.length >= 5 && clean.length <= 8) {
            out.push({
              id: `rule-centre-${out.length + 1}`,
              type: "id_number",
              source: "rule",
              confidence: 0.95,
              bbox: { ...w.bbox },
              risk: "medium",
              action: "mask",
              tagLabel: "ID_NUMBER",
              token: "<ID_01>",
            });
          }
        }
      }
    }

    // Vertical alignment
    for (const w of words) {
      if (centreRegex.test(w.text)) {
        const midX = (w.bbox.x0 + w.bbox.x1) / 2;
        const candidate = words.find((cw) => {
          const cMidX = (cw.bbox.x0 + cw.bbox.x1) / 2;
          const yDiff = cw.bbox.y0 - w.bbox.y1;
          const clean = cw.text.replace(/\D/g, "");
          return Math.abs(cMidX - midX) < 40 && yDiff > 4 && yDiff < 75 && clean.length >= 5 && clean.length <= 8;
        });
        if (candidate && !out.some((d) => d.bbox.x0 === candidate.bbox.x0 && d.bbox.y0 === candidate.bbox.y0)) {
          out.push({
            id: `rule-centre-vert-${out.length + 1}`,
            type: "id_number",
            source: "rule",
            confidence: 0.95,
            bbox: { ...candidate.bbox },
            risk: "medium",
            action: "mask",
            tagLabel: "ID_NUMBER",
            token: "<ID_01>",
          });
        }
      }
    }
  }

  // 8. API Tokens, Secrets, JWTs
  private static detectTokensAndSecrets(
    _words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const jwtRegex = /^eyJ[A-Za-z0-9-_=]+\.[A-Za-z0-9-_=]+(\.[A-Za-z0-9-_.+/=]*)?$/;
    const uuidRegex = /\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b/;
    const tokenContext = /token|api|key|secret|password|bearer|auth/i;

    for (const line of lines) {
      const lineHasContext = line.some((w) => tokenContext.test(w.text));

      for (const w of line) {
        if (uuidRegex.test(w.text)) {
          out.push({
            id: `rule-secret-uuid-${out.length + 1}`,
            type: "secret",
            source: "rule",
            confidence: 0.99,
            bbox: { ...w.bbox },
            risk: "critical",
            action: "mask",
            tagLabel: "SECRET",
            token: "<SECRET_01>",
          });
        } else if (jwtRegex.test(w.text) || (w.text.startsWith("eyJ") && w.text.length > 20)) {
          out.push({
            id: `rule-secret-jwt-${out.length + 1}`,
            type: "secret",
            source: "rule",
            confidence: 0.96,
            bbox: { ...w.bbox },
            risk: "critical",
            action: "mask",
            tagLabel: "SECRET",
            token: "<SECRET_01>",
          });
        } else if (lineHasContext && w.text.length >= 16 && /[A-Za-z0-9]/.test(w.text)) {
          out.push({
            id: `rule-secret-context-${out.length + 1}`,
            type: "secret",
            source: "rule",
            confidence: 0.95,
            bbox: { ...w.bbox },
            risk: "critical",
            action: "mask",
            tagLabel: "SECRET",
            token: "<SECRET_01>",
          });
        }
      }
    }
  }

  // 9. Credit Cards: 13-19 digits, Luhn check
  private static detectCreditCards(
    words: OCRWord[],
    _lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    for (const w of words) {
      const clean = w.text.replace(/[\s-]/g, "");
      if (/^\d{13,19}$/.test(clean) && this.luhnCheck(clean)) {
        out.push({
          id: `rule-card-${out.length + 1}`,
          type: "credit_card",
          source: "rule",
          confidence: 0.98,
          bbox: { ...w.bbox },
          risk: "critical",
          action: "mask",
          tagLabel: "CREDIT_CARD",
          token: "<CARD_01>",
        });
      }
    }
  }

  // 10. Customer ID, CIF Number, and MICR Code Detection
  private static detectCustomerAndBankingIds(
    _words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const idLabelRegex = /\b(?:customer\s*id|cust\s*id|customer|cif(?:\s*no|\s*number)?|micr(?:\s*code)?|member(?:\s*id)?)\b/i;

    for (const line of lines) {
      const lineText = line.map((w) => w.text).join(" ");
      if (idLabelRegex.test(lineText)) {
        for (const w of line) {
          const clean = w.text.replace(/\D/g, "");
          if (clean.length >= 6 && clean.length <= 16 && !idLabelRegex.test(w.text)) {
            out.push({
              id: `rule-custid-${out.length + 1}`,
              type: "id_number",
              source: "rule",
              confidence: 0.98,
              bbox: { ...w.bbox },
              risk: "high",
              action: "mask",
              tagLabel: "ID_NUMBER",
              token: "<ID_01>",
            });
          }
        }
      }
    }
  }

  // 11. Explicitly Labeled Personal Names (Passbooks, Statements, KYC: "Name : 1. NITESH KUMAR SAHU S/O BHARAT SAHU")
  private static detectLabeledNames(
    _words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const nameLabelRegex = /\b(?:name|customer\s*name|holder(?:\s*name)?|account\s*holder|applicant|नाम)\b/i;

    for (const line of lines) {
      const labelIdx = line.findIndex((w) => nameLabelRegex.test(w.text));
      if (labelIdx !== -1) {
        // Words after the label on this line
        const candidateWords = line.slice(labelIdx + 1).filter((w) => {
          const clean = w.text.replace(/[:.\s\-]/g, "");
          // Skip colons, hyphens, and simple index counters like "1." or "2."
          return clean.length > 0 && !/^(?:[:.\-]|1|2|3)$/.test(clean);
        });

        for (const cw of candidateWords) {
          // Add personal name tokens (e.g. "NITESH", "KUMAR", "SAHU", "BHARAT", "SAHU")
          if (!/^(?:S\/O|D\/O|W\/O|C\/O|SO|DO|WO|CO|श्री|श्रीमती)$/i.test(cw.text)) {
            out.push({
              id: `rule-name-${out.length + 1}`,
              type: "private_person",
              source: "rule",
              confidence: 0.98,
              bbox: { ...cw.bbox },
              risk: "medium",
              action: "mask",
              tagLabel: "PRIVATE_PERSON",
              token: "<PERSON_01>",
            });
          }
        }
      }
    }
  }

  // 12. Explicitly Labeled Customer / Branch Addresses (Passbooks, Statements, KYC forms)
  private static detectDocumentAddresses(
    _words: OCRWord[],
    lines: OCRWord[][],
    out: PIIDetection[]
  ): void {
    const addressLabelRegex = /\b(?:address|addr|br\.\s*address|cust\.\s*address|पता)\b/i;
    const stopKeywords = /(?:operational|nomination|scheme|queries|toll|open\s*dt|branch|account|ifsc|micr|phone|mobile|pan|aadhaar)\s*[:.\s\-]/i;
    const addressLandmarks = /\b(?:ward|vill|teh|distt|post|nagar|colony|road|rd|street|marg|sector|opp|bus\s*stand|chhattisgarh|india|\d{6})\b/i;

    let inAddressBlock = false;
    let linesSinceLabel = 0;
    let lastAddressMinX = 0;

    for (const line of lines) {
      const lineText = line.map((w) => w.text).join(" ");

      if (addressLabelRegex.test(lineText)) {
        inAddressBlock = true;
        linesSinceLabel = 0;
        // Words after "Address :" on this line
        const labelIdx = line.findIndex((w) => addressLabelRegex.test(w.text));
        const addrWords = line.slice(labelIdx + 1).filter((w) => w.text.replace(/[:.\s\-]/g, "").length > 0);
        if (addrWords.length > 0) {
          lastAddressMinX = Math.min(...addrWords.map((w) => w.bbox.x0));
          out.push({
            id: `rule-addr-${out.length + 1}`,
            type: "private_address",
            source: "rule",
            confidence: 0.96,
            bbox: RuleDetector.mergeWordBboxes(addrWords),
            risk: "medium",
            action: "mask",
            tagLabel: "PRIVATE_ADDRESS",
            token: "<ADDRESS_01>",
          });
        }
        continue;
      }

      if (inAddressBlock) {
        linesSinceLabel++;
        if (stopKeywords.test(lineText) || linesSinceLabel > 3) {
          inAddressBlock = false;
        } else if (addressLandmarks.test(lineText) || /^[A-Za-z0-9\s,.\-]+$/.test(lineText)) {
          // Strictly only include words aligned with the address column (never pull stray tokens from a left photo/QR column)
          const contWords = line.filter((w) => lastAddressMinX === 0 || w.bbox.x0 >= lastAddressMinX - 35);
          if (contWords.length > 0) {
            out.push({
              id: `rule-addr-cont-${out.length + 1}`,
              type: "private_address",
              source: "rule",
              confidence: 0.95,
              bbox: RuleDetector.mergeWordBboxes(contWords),
              risk: "medium",
              action: "mask",
              tagLabel: "PRIVATE_ADDRESS",
              token: "<ADDRESS_01>",
            });
          }
        }
      }
    }
  }

  private static luhnCheck(numStr: string): boolean {
    let sum = 0;
    let shouldDouble = false;
    for (let i = numStr.length - 1; i >= 0; i--) {
      let digit = parseInt(numStr.charAt(i), 10);
      if (shouldDouble) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
      shouldDouble = !shouldDouble;
    }
    return sum % 10 === 0;
  }
}
