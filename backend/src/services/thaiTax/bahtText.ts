/**
 * Converts a baht amount to Thai text, e.g. 1215750.5 -> "หนึ่งล้านสองแสนหนึ่งหมื่นห้าพันเจ็ดร้อยห้าสิบบาทห้าสิบสตางค์".
 * Thai tax invoices are conventionally required to spell the total out in words.
 */

const DIGITS = ['ศูนย์', 'หนึ่ง', 'สอง', 'สาม', 'สี่', 'ห้า', 'หก', 'เจ็ด', 'แปด', 'เก้า'];
// Place values within a 6-digit group, ones place last (index 0).
const PLACES = ['', 'สิบ', 'ร้อย', 'พัน', 'หมื่น', 'แสน'];

/** Converts a non-negative integer (< 10^12) to Thai digit words, no currency unit. */
function integerToThaiWords(n: number): string {
  if (n === 0) return DIGITS[0];

  // Split into 6-digit groups (ล้าน = 10^6), most-significant group first.
  const groups: number[] = [];
  let remaining = n;
  do {
    groups.unshift(remaining % 1_000_000);
    remaining = Math.floor(remaining / 1_000_000);
  } while (remaining > 0);

  // Whether any earlier (more significant) group was non-zero — needed because
  // the final group's ones digit reads as "เอ็ด" not "หนึ่ง" whenever *anything*
  // precedes it in the full number, even if that's a whole earlier ล้าน group
  // and the last group is otherwise just a bare "1" (e.g. 1,000,001).
  let sawNonZeroGroup = false;

  return groups
    .map((group, groupIndex) => {
      const isLastGroup = groupIndex === groups.length - 1;
      if (group === 0) return '';
      const hasPrecedingNonZero = sawNonZeroGroup;
      sawNonZeroGroup = true;
      const digitsStr = String(group);
      let out = '';
      for (let i = 0; i < digitsStr.length; i++) {
        const digit = Number(digitsStr[i]);
        const placeFromRight = digitsStr.length - 1 - i;
        if (digit === 0) continue;

        if (placeFromRight === 0) {
          // Ones place: "เอ็ด" instead of "หนึ่ง" whenever anything precedes it
          // — a higher digit in this group, or a non-zero earlier group. Only
          // the last group's ones digit is a true "ones" position; in an
          // earlier group this digit is itself worth a multiple of 10^6+.
          if (digit === 1 && isLastGroup && (digitsStr.length > 1 || hasPrecedingNonZero)) {
            out += 'เอ็ด';
          } else {
            out += DIGITS[digit];
          }
        } else if (placeFromRight === 1) {
          // Tens place: "ยี่สิบ" not "สองสิบ"; bare "สิบ" not "หนึ่งสิบ".
          if (digit === 2) out += 'ยี่' + PLACES[1];
          else if (digit === 1) out += PLACES[1];
          else out += DIGITS[digit] + PLACES[1];
        } else {
          out += DIGITS[digit] + PLACES[placeFromRight];
        }
      }
      return out + (isLastGroup ? '' : 'ล้าน');
    })
    .join('');
}

export function toBahtText(amount: number): string {
  const negative = amount < 0;
  const rounded = Math.round(Math.abs(amount) * 100) / 100;
  const baht = Math.floor(rounded);
  const satang = Math.round((rounded - baht) * 100);

  const bahtWords = integerToThaiWords(baht) + 'บาท';
  const satangWords = satang === 0 ? 'ถ้วน' : integerToThaiWords(satang) + 'สตางค์';

  return (negative ? 'ลบ' : '') + bahtWords + satangWords;
}
