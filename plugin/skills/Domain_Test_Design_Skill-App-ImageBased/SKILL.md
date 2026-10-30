---
name: "Domain_Test_Design_Skill-App-ImageBased"
description: "Image-based application (OCR, intelligent document processing, document capture, ID verification, face/liveness, medical imaging DICOM, computer vision, visual search, barcode/QR) test design sub-skill of Domain_Test_Design_Skill: detection signals, input variation dimensions, formats, oracles and accuracy metrics, checklist, scenario patterns across Positive, Negative, Boundary, End-to-end, Business and Edge categories, metamorphic tests, bias and privacy checks, tooling and pitfalls. Use when the application under test processes images or scanned documents, or when Domain_Test_Design_Skill routes an image-based application here."
---

# Image-based applications (sub-skill of Domain_Test_Design_Skill)

Test design for systems whose main input is an image or scan. Accuracy has no single exact oracle, so design relies on labelled datasets, metrics and metamorphic relations (Domain_Test_Design_Skill-Core-Techniques T15).

## Detection signals
- Upload/capture of documents, IDs, receipts, invoices, photos, X-rays; OCR/IDP vendors; ML model endpoints.
- DICOM/PACS, barcode/QR scanning, face match, liveness.

## Input variation dimensions
Resolution/DPI, blur, noise, skew/rotation, lighting/contrast, compression, partial occlusion, cropping, colour vs greyscale, handwriting vs print, multi-page, mixed languages/scripts, glare, watermark, stamps, folded/torn paper, screenshot vs photo vs scan, background clutter.

## Formats
JPEG, PNG, TIFF (multi-page), HEIC, BMP, WebP, GIF, PDF (image/text/hybrid), DICOM; corrupted headers; wrong extension; very large (e.g. 100 MP) and very small (e.g. 32×32) images; EXIF orientation flags.

## Oracles and metrics
| Task | Metric |
|---|---|
| OCR | Character / word error rate (CER/WER) |
| Field extraction | Field-level accuracy, exact match, straight-through-processing rate |
| Classification | Precision, recall, F1, confusion matrix |
| Detection | IoU, mAP |
| Biometrics | False accept / false reject rate (FAR/FRR), APCER/BPCER for liveness |
| Confidence | Calibration (confidence vs actual accuracy) |
| Throughput | Images per minute, queue latency |

## Checklist
- [ ] Labelled golden dataset per document type with agreed accuracy targets.
- [ ] Confidence thresholds route low-confidence results to human review.
- [ ] Every format and size limit; EXIF orientation honoured.
- [ ] Metamorphic relations (rotate, scale, recompress) preserve results within tolerance.
- [ ] Fraud/tamper: duplicates, edited images, screen re-photos, printed photos, masks.
- [ ] Privacy: faces/PHI masked in logs and exports; retention and deletion of images.
- [ ] Bias: accuracy across skin tones, ages, genders, lighting within tolerance.
- [ ] Model version change: regression on the golden set before release.
- [ ] Accessibility of the capture flow (guidance, alt text, non-camera alternative).

## Scenario patterns

### Positive
| Pattern | Example | Expected result |
|---|---|---|
| Clean scan | 300 DPI invoice | All key fields extracted correctly |
| Multi-page | 5-page TIFF | All pages processed in order |
| ID capture | Valid passport photo | MRZ parsed; data matches visual zone |
| Barcode | Clear QR code | Decoded payload correct |
| DICOM | Valid study | Patient/study metadata matched to order |

### Negative
| Pattern | Example | Expected result |
|---|---|---|
| Wrong document | Selfie instead of ID | Rejected with guidance |
| Corrupt file | Truncated JPEG | Error; no crash; user asked to retry |
| Unsupported format | `.svg` upload | Rejected with supported list |
| Spoof | Printed photo for liveness | Rejected (attack detected) |
| Tampered | Edited amount on receipt | Flagged for review |

### Boundary
| Pattern | Example | Expected result |
|---|---|---|
| Resolution | Minimum DPI and below | Processed; rejected/low-confidence |
| File size | Max size and max + 1 | Accepted; rejected |
| Confidence | Threshold − 0.01 / threshold | Manual review; auto-accepted |
| Page count | Max pages and max + 1 | Processed; rejected |
| Skew | 0°, 15°, 45° | Within tolerance up to agreed limit |

### End-to-end
| Pattern | Example | Expected result |
|---|---|---|
| Capture → extract → validate → post | Invoice to ERP | ERP invoice matches extracted fields |
| Review loop | Low-confidence → reviewer corrects → post | Corrected values posted; feedback stored |
| KYC | ID + selfie + liveness → decision | Decision with reasons; audit trail |
| Imaging | Modality → PACS → viewer → report | Image and report linked to correct patient |
| Batch | 10 000 images overnight | All processed within window; failures listed |

### Business scenarios
| Pattern | Example | Expected result |
|---|---|---|
| AP clerk | Process supplier invoices daily | Straight-through rate meets target |
| Insurance claim | Photos of car damage | Damage assessment and estimate generated |
| Onboarding | Customer verifies identity on phone | Verified in < 2 min or routed to manual |
| Retail | Visual search for a product photo | Relevant products ranked top |
| Logistics | Proof-of-delivery photo | Attached to shipment with geotag/time |

### Edge conditions
| Pattern | Example | Expected result |
|---|---|---|
| Rotation | Same document at 90/180/270° | Identical extracted fields |
| Mixed scripts | Arabic + English on one ID | Both scripts read; directions correct |
| Glare/shadow | Partial glare over a field | Field flagged low-confidence |
| Duplicate | Same receipt submitted twice | Duplicate detected |
| Demographics | Faces across skin tones and lighting | FRR within tolerance for every group |

## Test-type applicability
| Test type | Relevance |
|---|---|
| Functional (accuracy), Regression (model/version), API, Security (privacy, spoofing), Performance (throughput) | ● |
| UI/UX, Localisation (scripts), Accessibility (capture alternatives) | ◐ |
| Integration, Data migration | ◐ |

## Tools and automation
- Golden datasets with labels under version control; scoring scripts for CER/WER/F1; API-level tests in the <AppName>/ automation folder (`@api`) that upload fixtures and assert extracted JSON against labels within tolerance.
- Image augmentation (rotate, blur, compress) to generate metamorphic variants.

## Common pitfalls
- Testing with a few clean samples only; no tolerance-based oracle.
- Ignoring EXIF orientation and HEIC from phones.
- No bias or spoof testing; PHI in logs.

## Related sub-skills
Domain_Test_Design_Skill-App-AIML, Domain_Test_Design_Skill-Test-Functional, Domain_Test_Design_Skill-Test-Security, Domain_Test_Design_Skill-Test-Performance, Domain_Test_Design_Skill-Domain-Healthcare, Domain_Test_Design_Skill-Domain-Insurance
