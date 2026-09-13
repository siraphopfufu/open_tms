/**
 * Default Invoice HTML Template.
 * Shows Thai VAT/WHT breakdown (subtotal, VAT 7%, WHT 1%, net payable) when
 * the invoice carries them; those fields are zero for non-THB invoices, so
 * the same template renders a plain USD invoice unchanged.
 */
export const defaultInvoiceTemplate = `
{{#if branding.orgName}}
<div style="text-align:center;margin-bottom:8px;">
  <span style="font-size:20px;font-weight:bold;color:{{branding.primaryColor}};">{{branding.orgName}}</span>
</div>
{{/if}}
<h1>INVOICE</h1>
<table>
  <tr>
    <td><strong>Invoice #:</strong> {{invoiceNumber}}</td>
    <td><strong>Issue Date:</strong> {{issueDate}}</td>
    <td><strong>Due Date:</strong> {{dueDate}}</td>
  </tr>
</table>

<h2>Bill To</h2>
<p>
  {{customer.name}}<br/>
  {{#if customer.taxId}}Tax ID: {{customer.taxId}}<br/>{{/if}}
  {{#if customer.billingAddress1}}{{customer.billingAddress1}}<br/>{{/if}}
  {{#if customer.billingAddress2}}{{customer.billingAddress2}}<br/>{{/if}}
  {{#if customer.billingCity}}{{customer.billingCity}}, {{customer.billingState}} {{customer.billingPostalCode}}<br/>{{/if}}
  {{customer.billingCountry}}
</p>

{{#if org.taxId}}
<h2>From</h2>
<p>
  {{branding.orgName}}<br/>
  Tax ID: {{org.taxId}}
</p>
{{/if}}

<h2>Charges</h2>
<table>
  <tr>
    <td><strong>Description</strong></td>
    <td><strong>Container</strong></td>
    <td><strong>Amount</strong></td>
  </tr>
  {{#each lineItems}}
  <tr>
    <td>{{this.description}}</td>
    <td>{{this.containerNumber}}</td>
    <td>{{this.amount}}</td>
  </tr>
  {{/each}}
</table>

<table style="margin-top:12px;">
  <tr>
    <td>Subtotal</td>
    <td>{{currencySymbol}}{{subtotal}}</td>
  </tr>
  {{#if hasThaiTax}}
  <tr>
    <td>VAT (7%)</td>
    <td>{{currencySymbol}}{{vat}}</td>
  </tr>
  <tr>
    <td>Withholding Tax (1%, deducted by payer)</td>
    <td>-{{currencySymbol}}{{wht}}</td>
  </tr>
  {{/if}}
  <tr>
    <td><strong>{{#if hasThaiTax}}Net Payable{{else}}Total{{/if}}</strong></td>
    <td><strong>{{currencySymbol}}{{netPayable}}</strong></td>
  </tr>
</table>

{{#if netPayableBahtText}}
<p><em>({{netPayableBahtText}})</em></p>
{{/if}}

{{#if notes}}
<h2>Notes</h2>
<p>{{notes}}</p>
{{/if}}

<p style="margin-top:24px;">Payment terms: Net {{paymentTermsDays}} days from issue date.</p>
`;
