import * as XLSX from "xlsx"

/**
 * Export data to Excel format
 */
export function exportToExcel(
  data: Record<string, unknown>[],
  filename: string,
  sheetName: string = "Data"
) {
  if (!data || data.length === 0) {
    throw new Error("No data to export")
  }

  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new()

    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data)

    // Auto-size columns based on content
    const colWidths = getColumnWidths(data)
    worksheet["!cols"] = colWidths

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, sheetName)

    // Generate Excel file and trigger download
    XLSX.writeFile(workbook, `${filename}.xlsx`)

    return true
  } catch (error) {
    console.error("[v0] Excel export error:", error)
    throw new Error("Failed to export to Excel")
  }
}

/**
 * Export data to CSV format
 */
export function exportToCSV(
  data: Record<string, unknown>[],
  filename: string
) {
  if (!data || data.length === 0) {
    throw new Error("No data to export")
  }

  try {
    // Create a new workbook
    const workbook = XLSX.utils.book_new()

    // Convert data to worksheet
    const worksheet = XLSX.utils.json_to_sheet(data)

    // Add worksheet to workbook
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data")

    // Generate CSV file and trigger download
    XLSX.writeFile(workbook, `${filename}.csv`)

    return true
  } catch (error) {
    console.error("[v0] CSV export error:", error)
    throw new Error("Failed to export to CSV")
  }
}

/**
 * Export data to JSON format
 */
export function exportToJSON(
  data: Record<string, unknown>[],
  filename: string
) {
  if (!data || data.length === 0) {
    throw new Error("No data to export")
  }

  try {
    const jsonString = JSON.stringify(data, null, 2)
    const blob = new Blob([jsonString], { type: "application/json" })
    const url = URL.createObjectURL(blob)

    const link = document.createElement("a")
    link.href = url
    link.download = `${filename}.json`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
    return true
  } catch (error) {
    console.error("[v0] JSON export error:", error)
    throw new Error("Failed to export to JSON")
  }
}

/**
 * Export data as plain text table
 */
export function exportToText(
  data: Record<string, unknown>[],
  filename: string
) {
  if (!data || data.length === 0) {
    throw new Error("No data to export")
  }

  try {
    const text = formatAsTable(data)
    const blob = new Blob([text], { type: "text/plain" })
    const url = URL.createObjectURL(blob)

    const link = document.createElement("a")
    link.href = url
    link.download = `${filename}.txt`
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)

    URL.revokeObjectURL(url)
    return true
  } catch (error) {
    console.error("[v0] Text export error:", error)
    throw new Error("Failed to export to text")
  }
}

/**
 * Calculate column widths for Excel sheets
 */
function getColumnWidths(
  data: Record<string, unknown>[]
): Array<{ wch: number }> {
  if (!data || data.length === 0) {
    return []
  }

  const keys = Object.keys(data[0])
  return keys.map((key) => ({
    wch: Math.min(
      Math.max(
        key.length + 2,
        Math.max(
          ...data.map((row) => {
            const val = row[key]
            return String(val || "").length
          })
        )
      ),
      50
    ),
  }))
}

/**
 * Format data as a plain text table
 */
function formatAsTable(data: Record<string, unknown>[]): string {
  if (!data || data.length === 0) {
    return ""
  }

  const keys = Object.keys(data[0])
  const colWidths = keys.map((key) =>
    Math.max(
      key.length,
      Math.max(
        ...data.map((row) => String(row[key] || "").length)
      )
    )
  )

  const separator = "+" + colWidths.map((w) => "-".repeat(w + 2)).join("+") + "+"
  const header = "| " + keys.map((k, i) => k.padEnd(colWidths[i])).join(" | ") + " |"

  const rows = data.map(
    (row) =>
      "| " +
      keys
        .map((k, i) => String(row[k] || "").padEnd(colWidths[i]))
        .join(" | ") +
      " |"
  )

  return [separator, header, separator, ...rows, separator].join("\n")
}

/**
 * Get export filename with timestamp
 */
export function getExportFilename(prefix: string = "export"): string {
  const date = new Date()
  const dateStr = date.toISOString().split("T")[0]
  const timeStr = date.toTimeString().split(" ")[0].replace(/:/g, "-")
  return `${prefix}_${dateStr}_${timeStr}`
}
