export function extractPrintableStrings(buffer, minLength = 6) {
  const results = [];
  let current = '';
  for (const byte of buffer) {
    if (byte >= 0x20 && byte <= 0x7e) {
      current += String.fromCharCode(byte);
    } else {
      if (current.length >= minLength) results.push(current);
      current = '';
    }
  }
  if (current.length >= minLength) results.push(current);
  return results;
}

export function unique(values) {
  return [...new Set(values)];
}
