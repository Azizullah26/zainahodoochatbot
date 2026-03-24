/**
 * Allowed Odoo models based on the implementation brief (Section 9).
 */
export const ALLOWED_MODELS = {
  employee: [
    "hr.employee",
    "project.project",
    "account.move",
    "hr.leave",
    "purchase.order",
    "hr.expense",
    "project.task",
    "project.task.type",
    "hr.attendance",
    "hr.timesheet",
  ],
  hr_admin: [
    "hr.employee",
    "hr.leave",
    "hr.employee.evaluation",
    "hr.overtime",
    "hr.timesheet",
    "res.users",
    "res.groups",
  ],
  projects: [
    "project.project",
    "project.task",
    "project.report",
    "project.wir",
    "sc.payment",
    "material.request",
  ],
  purchase: ["purchase.order", "purchase.agreement"],
  clients_vendors: ["res.partner"],
  accounting: ["account.move", "account.account", "account.journal"],
  petty_cash: ["hr.expense.sheet", "hr.expense"],
  letters: ["letter.reference"],
}

/**
 * Model-specific fields to fetch - maps model to recommended display fields
 */
export const MODEL_FIELDS: Record<string, string[]> = {
  "hr.employee": ["id", "name", "emp_id", "department_id", "job_title", "work_email"],
  "project.project": ["id", "name", "partner_id", "date_start", "date", "state"],
  "project.task": ["id", "name", "project_id", "user_ids", "state", "date_deadline"],
  "account.move": ["id", "name", "partner_id", "date", "amount_total", "state"],
  "hr.leave": ["id", "employee_id", "date_from", "date_to", "state", "number_of_days"],
  "purchase.order": ["id", "name", "partner_id", "date_order", "amount_total", "state"],
  "hr.expense": ["id", "name", "employee_id", "amount", "state"],
  "res.partner": ["id", "name", "email", "phone", "country_id"],
  "hr.attendance": ["id", "employee_id", "check_in", "check_out"],
  "hr.timesheet": ["id", "employee_id", "project_id", "date", "unit_amount"],
}

/**
 * Flat list of all allowed models for quick validation.
 */
export const ALL_ALLOWED_MODELS = Object.values(ALLOWED_MODELS).flat()

/**
 * Synonym mapping for "Broken English" / alternative terms.
 */
export const SYNONYMS: Record<string, string> = {
  lpo: "purchase.order",
  "vendor invoice": "account.move",
  "supplier bill": "account.move",
  mr: "material.request",
  "material request": "material.request",
  "petty cash": "hr.expense",
  project: "project.project",
  task: "project.task",
  leave: "hr.leave",
  rfq: "purchase.order",
  requests: "hr.leave",
  "leave request": "hr.leave",
  payment: "sc.payment",
  "subcontractor payment": "sc.payment",
  employee: "hr.employee",
  partner: "res.partner",
  client: "res.partner",
  vendor: "res.partner",
  bill: "account.move",
  attendance: "hr.attendance",
  timesheet: "hr.timesheet",
}

/**
 * Get allowed models for a given role.
 * Returns the models this role can access.
 */
export function getAllowedModelsForRole(role: string): string[] {
  // Extract role key from Odoo's XML ID format (e.g., "base.group_user" -> "employee")
  const roleKey = role.split(".").pop() || role

  for (const [key, models] of Object.entries(ALLOWED_MODELS)) {
    if (roleKey.includes(key) || role.includes(key)) {
      return models
    }
  }

  // Default to employee if no match
  return ALLOWED_MODELS.employee
}

/**
 * Get all allowed models for multiple roles (union of all).
 */
export function getAllowedModelsForRoles(roles: string[]): string[] {
  const allModels = new Set<string>()
  for (const role of roles) {
    const roleModels = getAllowedModelsForRole(role)
    roleModels.forEach((m) => allModels.add(m))
  }
  return Array.from(allModels)
}

/**
 * Validate if a model is allowed for a user's roles.
 */
export function isModelAllowed(model: string, roles: string[]): boolean {
  const allowed = getAllowedModelsForRoles(roles)
  return allowed.includes(model)
}

/**
 * Resolve a user query term to an Odoo model (using synonyms).
 */
export function resolveModelFromQuery(query: string): string | null {
  const normalized = query.toLowerCase().trim()
  return SYNONYMS[normalized] || null
}

/**
 * Get recommended fields to fetch for a model.
 */
export function getModelFields(model: string): string[] {
  return MODEL_FIELDS[model] || []
}

/**
 * Detect models mentioned in user query using synonyms.
 */
export function detectModelsInQuery(query: string): string[] {
  const detected = new Set<string>()
  const lowerQuery = query.toLowerCase()

  // Check for direct model mentions
  for (const [synonym, model] of Object.entries(SYNONYMS)) {
    if (lowerQuery.includes(synonym)) {
      detected.add(model)
    }
  }

  // Check for model names directly
  for (const modelList of Object.values(ALLOWED_MODELS)) {
    for (const model of modelList) {
      const modelName = model.split(".").pop()
      if (modelName && lowerQuery.includes(modelName)) {
        detected.add(model)
      }
    }
  }

  return Array.from(detected)
}

