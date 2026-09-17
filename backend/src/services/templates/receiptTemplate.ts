/**
 * Official receipt (ใบเสร็จรับเงิน) — issued once a customer's payment against
 * an invoice clears, numbered separately from the invoice sequence.
 */
export const defaultReceiptTemplate = `
{{#if branding.orgName}}
<div style="text-align:center;margin-bottom:8px;">
  <span style="font-size:20px;font-weight:bold;color:{{branding.primaryColor}};">{{branding.orgName}}</span>
</div>
{{/if}}
<h1>ใบเสร็จรับเงิน</h1>
<h2>Official Receipt</h2>
<table>
  <tr>
    <td><strong>Receipt #:</strong> {{receiptNumber}}</td>
    <td><strong>Issue Date:</strong> {{issueDate}}</td>
    <td><strong>Invoice Ref.:</strong> {{invoiceNumber}}</td>
  </tr>
</table>

<h2>ผู้รับเงิน (Received By)</h2>
<p>{{payeeName}}</p>

<h2>ผู้ชำระเงิน (Received From)</h2>
<p>{{customerName}}</p>

<h2>รายละเอียด (Detail)</h2>
<table>
  <tr>
    <td><strong>จำนวนเงินที่ได้รับ (Amount Received)</strong></td>
    <td>{{amount}}</td>
  </tr>
</table>

{{#if amountBahtText}}
<p><em>({{amountBahtText}})</em></p>
{{/if}}

<p style="margin-top:24px;">
ได้รับเงินตามรายการข้างต้นไว้ถูกต้องแล้ว<br/>
Received in good order.
</p>

<div style="margin-top:24px;">
<table>
  <tr>
    <td><strong>ผู้รับเงิน (Received By Signature):</strong> ____________________</td>
    <td><strong>วันที่ (Date):</strong> ____________________</td>
  </tr>
</table>
</div>
`;
