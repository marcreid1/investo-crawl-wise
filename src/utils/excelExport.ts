import * as XLSX from "xlsx";
import type { Investment } from "@/pages/Index";

export const exportToExcel = (investments: Investment[], filename: string = "investments_data.xlsx") => {
  // Prepare data for Excel
  const excelData = investments.map((inv) => ({
    "Investment Name": inv.name || "",
    "Industry": inv.industry || "",
    "Date": inv.date || "",
    "Description": inv.description || "",
    "Partners": inv.partners ? inv.partners.join(", ") : "",
    "Portfolio URL": inv.portfolioUrl || "",
    "Source URL": inv.sourceUrl || "",
  }));

  // Create a new workbook
  const workbook = XLSX.utils.book_new();

  // Convert data to worksheet
  const worksheet = XLSX.utils.json_to_sheet(excelData);

  // Set column widths for better readability
  const columnWidths = [
    { wch: 30 }, // Investment Name
    { wch: 20 }, // Industry
    { wch: 15 }, // Date
    { wch: 50 }, // Description
    { wch: 30 }, // Partners
    { wch: 40 }, // Portfolio URL
    { wch: 40 }, // Source URL
  ];
  worksheet["!cols"] = columnWidths;

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, "Investments");

  // Generate Excel file and trigger download
  XLSX.writeFile(workbook, filename);
};
