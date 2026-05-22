export function escapeCsvValue(value: string): string {
  if (value.includes(',') || value.includes('"') || value.includes('\r') || value.includes('\n')) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

export function buildCsvRow(values: string[]): string {
  return values.map(escapeCsvValue).join(',') + '\r\n'
}

export function buildCsvContent(rows: string[][]): string {
  return rows.map(buildCsvRow).join('')
}
