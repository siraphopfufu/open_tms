/**
 * Driver job sheet (ใบสั่งงานคนขับ) — a single A4 page the driver keeps in the
 * cab: tractor/trailer plates, driver name, booking/container/seal numbers,
 * the pickup/delivery points, and the cash advance amount, for showing at
 * the terminal gate and the factory. See tms_evaluation_feedback_report.md
 * section 4.2, "Must Have" item 7.
 */
export const defaultJobSheetTemplate = `
{{#if branding.orgName}}
<div style="text-align:center;margin-bottom:8px;">
  <span style="font-size:20px;font-weight:bold;color:{{branding.primaryColor}};">{{branding.orgName}}</span>
</div>
{{/if}}
<h1>ใบสั่งงานคนขับ</h1>
<h2>Driver Job Sheet — {{reference}}</h2>
<table>
  <tr>
    <td><strong>วันที่รับงาน (Pickup Date):</strong> {{pickupDate}}</td>
    <td><strong>เลขที่งาน (Reference):</strong> {{reference}}</td>
  </tr>
</table>

<h2>รถและคนขับ (Vehicle &amp; Driver)</h2>
<table>
  <tr>
    <td><strong>ทะเบียนหัวลาก (Tractor):</strong></td>
    <td>{{tractorPlate}}</td>
  </tr>
  <tr>
    <td><strong>ทะเบียนหางลาก (Trailer):</strong></td>
    <td>{{trailerPlate}}</td>
  </tr>
  <tr>
    <td><strong>ชื่อคนขับ (Driver):</strong></td>
    <td>{{driverName}}</td>
  </tr>
  <tr>
    <td><strong>เบอร์โทรคนขับ (Driver Phone):</strong></td>
    <td>{{driverPhone}}</td>
  </tr>
</table>

<h2>รายละเอียดตู้คอนเทนเนอร์ (Container Detail)</h2>
<table>
  <tr>
    <td><strong>เลขที่ Booking:</strong></td>
    <td>{{bookingNumber}}</td>
  </tr>
  <tr>
    <td><strong>เลขตู้ (Container No.):</strong></td>
    <td>{{containerNumber}}</td>
  </tr>
  <tr>
    <td><strong>ขนาดตู้ (Size/Type):</strong></td>
    <td>{{containerSize}}</td>
  </tr>
  <tr>
    <td><strong>เบอร์ซีล (Seal No.):</strong></td>
    <td>{{sealNumber}}</td>
  </tr>
</table>

<h2>จุดรับ-ส่ง (Route)</h2>
<table>
  <tr>
    <td><strong>จุดต้นทาง (Origin):</strong></td>
    <td>{{originName}}</td>
  </tr>
  <tr>
    <td><strong>จุดปลายทาง (Destination):</strong></td>
    <td>{{destinationName}}</td>
  </tr>
</table>

<h2>เงินทดรองจ่าย (Cash Advance)</h2>
<table>
  <tr>
    <td><strong>ยอดเงินทดรองจ่าย (Advance Amount):</strong></td>
    <td>{{advanceAmount}}</td>
  </tr>
</table>

<p style="margin-top:24px;">
เอกสารนี้ใช้สำหรับยื่นแสดงต่อป้อมยามหน้าท่าเรือและโรงงาน<br/>
Present this sheet at the terminal gate and factory checkpoint.
</p>

<div style="margin-top:24px;">
<table>
  <tr>
    <td><strong>ผู้จัดรถ (Dispatcher):</strong> ____________________</td>
    <td><strong>ลายเซ็นคนขับ (Driver Signature):</strong> ____________________</td>
  </tr>
</table>
</div>
`;
