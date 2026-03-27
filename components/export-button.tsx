import React, { useState } from "react"
import { Button } from "@/components/ui/button"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Download, FileJson, FileText, Sheet, File } from "lucide-react"
import { toast } from "sonner"
import {
  exportToExcel,
  exportToCSV,
  exportToJSON,
  exportToText,
  getExportFilename,
} from "@/lib/export"

interface ExportButtonProps {
  data: Record<string, unknown>[]
  filename?: string
  disabled?: boolean
}

export function ExportButton({
  data,
  filename = getExportFilename("odoo-data"),
  disabled = false,
}: ExportButtonProps) {
  const [isLoading, setIsLoading] = useState(false)

  if (!data || data.length === 0) {
    return null
  }

  const handleExport = async (format: "excel" | "csv" | "json" | "text") => {
    setIsLoading(true)
    try {
      switch (format) {
        case "excel":
          exportToExcel(data, filename, "Data")
          toast.success("Exported to Excel successfully")
          break
        case "csv":
          exportToCSV(data, filename)
          toast.success("Exported to CSV successfully")
          break
        case "json":
          exportToJSON(data, filename)
          toast.success("Exported to JSON successfully")
          break
        case "text":
          exportToText(data, filename)
          toast.success("Exported to text successfully")
          break
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : "Export failed"
      toast.error(errorMsg)
      console.error("[v0] Export error:", error)
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          disabled={disabled || isLoading}
          className="gap-2"
        >
          <Download className="h-4 w-4" />
          {isLoading ? "Exporting..." : "Export"}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuItem
          onClick={() => handleExport("excel")}
          disabled={isLoading}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Sheet className="h-4 w-4 text-green-600" />
          <span>Export to Excel</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("csv")}
          disabled={isLoading}
          className="flex items-center gap-2 cursor-pointer"
        >
          <Sheet className="h-4 w-4 text-blue-600" />
          <span>Export to CSV</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("json")}
          disabled={isLoading}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FileJson className="h-4 w-4 text-yellow-600" />
          <span>Export to JSON</span>
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => handleExport("text")}
          disabled={isLoading}
          className="flex items-center gap-2 cursor-pointer"
        >
          <FileText className="h-4 w-4 text-gray-600" />
          <span>Export as Text</span>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
