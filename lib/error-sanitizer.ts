/**
 * Sanitizes technical Odoo error messages to user-friendly messages
 * Hides model names, field names, and technical details
 */

// Map of Odoo model names to friendly display names
const modelFriendlyNames: Record<string, string> = {
  "hr.leave": "Leave Requests",
  "hr.employee": "Employees",
  "project.project": "Projects",
  "project.task": "Tasks",
  "account.move": "Invoices/Bills",
  "purchase.order": "Purchase Orders",
  "hr.expense": "Expense Claims",
  "material.request": "Material Requests",
  "hr.timesheet": "Timesheets",
  "hr.attendance": "Attendance",
  "res.partner": "Partners",
  "search_read": "Data",
  "read_group": "Data",
}

export function sanitizeError(error: string | null | undefined): string {
  if (!error) return "Unable to fetch the requested data."

  const errorStr = String(error)

  // Hide search_read tool name
  if (errorStr.includes("search_read")) {
    return "Unable to fetch the requested data."
  }

  // Hide model-specific errors with friendly names
  // Match: "Invalid field 'X' on model 'Y'"
  const fieldModelMatch = errorStr.match(/Invalid field ['"]([^'"]+)['"] on model ['"]([^'"]+)['"]/i)
  if (fieldModelMatch) {
    const [, fieldName, modelName] = fieldModelMatch
    const friendlyModel = modelFriendlyNames[modelName] || modelName
    return `Some fields are not available for ${friendlyModel}. Please try a different query.`
  }

  // Hide model not found errors
  if (errorStr.includes("Model") && errorStr.includes("not found")) {
    return "This data type is not available. Please try a different query."
  }

  // Hide access denied errors with friendly message
  if (errorStr.includes("AccessError") || errorStr.includes("Access Denied")) {
    return "You don't have permission to access this data."
  }

  // Hide validation errors
  if (errorStr.includes("ValidationError")) {
    return "The request format is invalid. Please try again."
  }

  // Generic fallback: show first 100 chars if nothing matches, or hide if too technical
  if (errorStr.length > 150 || errorStr.includes("Traceback") || errorStr.includes("Exception")) {
    return "An error occurred while fetching the data. Please try again."
  }

  // For short, readable errors, show them as-is (these are usually good messages)
  return errorStr
}

/**
 * Get a user-friendly name for a tool/model
 */
export function getToolFriendlyName(toolName: string): string {
  return modelFriendlyNames[toolName] || toolName
}
