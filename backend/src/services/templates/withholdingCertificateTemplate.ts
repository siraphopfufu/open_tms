/**
 * Withholding tax certificate (หนังสือรับรองการหักภาษี ณ ที่จ่าย / "50 ทวิ") template.
 *
 * This lays out the data a 50-Tawi certificate must carry, not a pixel copy of
 * the official Revenue Department form — check the certificate this produces
 * against the current official form and an accountant's review before using
 * it for real filings.
 */
export const defaultWithholdingCertificateTemplate = `
{{#if branding.orgName}}
<div style="text-align:center;margin-bottom:8px;">
  <span style="font-size:20px;font-weight:bold;color:{{branding.primaryColor}};">{{branding.orgName}}</span>
</div>
{{/if}}
<h1>หนังสือรับรองการหักภาษี ณ ที่จ่าย</h1>
<h2>Withholding Tax Certificate</h2>
<table>
  <tr>
    <td><strong>Certificate #:</strong> {{certificateNumber}}</td>
    <td><strong>Issue Date:</strong> {{issueDate}}</td>
    <td><strong>Form:</strong> {{formLabel}}</td>
  </tr>
</table>

<h2>ผู้มีหน้าที่หักภาษี ณ ที่จ่าย (Withholder / Payer)</h2>
<p>
  {{payerName}}<br/>
  {{#if payerTaxId}}เลขประจำตัวผู้เสียภาษี (Tax ID): {{payerTaxId}}{{/if}}
</p>

<h2>ผู้ถูกหักภาษี ณ ที่จ่าย (Payee)</h2>
<p>
  {{payeeName}}<br/>
  {{#if payeeTaxId}}เลขประจำตัวผู้เสียภาษี (Tax ID): {{payeeTaxId}}{{/if}}
</p>

<h2>รายละเอียดการหักภาษี (Withholding Detail)</h2>
<table>
  <tr>
    <td><strong>ประเภทเงินได้ (Income Type)</strong></td>
    <td>{{incomeDescription}}</td>
  </tr>
  <tr>
    <td><strong>อ้างอิงใบแจ้งหนี้ (Invoice Ref.)</strong></td>
    <td>{{invoiceNumber}}</td>
  </tr>
  <tr>
    <td><strong>เงินได้ที่จ่าย (Amount Paid)</strong></td>
    <td>{{taxableAmount}}</td>
  </tr>
  <tr>
    <td><strong>อัตราภาษีที่หัก (Rate)</strong></td>
    <td>1%</td>
  </tr>
  <tr>
    <td><strong>ภาษีที่หักและนำส่ง (Tax Withheld)</strong></td>
    <td>{{witheldAmount}}</td>
  </tr>
</table>

<p><em>({{witheldAmountBahtText}})</em></p>

<p style="margin-top:24px;">
ข้าพเจ้าขอรับรองว่าข้อความข้างต้นถูกต้องตามความเป็นจริงทุกประการ<br/>
I certify that the above is true and correct.
</p>

<div style="margin-top:24px;">
<table>
  <tr>
    <td><strong>ผู้จ่ายเงิน (Payer Signature):</strong> ____________________</td>
    <td><strong>วันที่ (Date):</strong> ____________________</td>
  </tr>
</table>
</div>
`;
