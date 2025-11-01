import * as XLSX from "xlsx";
import type { Investment } from "@/pages/Index";

export const exportToExcel = (investments: Investment[], filename: string = "investments_data.xlsx") => {
  // Prepare data for Excel with cleaned, single-line text
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

  // Configure cells to wrap text and prevent line breaks
  const range = XLSX.utils.decode_range(worksheet["!ref"] || "A1");
  for (let row = range.s.r; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cellAddress = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      if (cell) {
        // Ensure text is in a single line
        if (typeof cell.v === "string") {
          cell.v = cell.v.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
        }
      }
    }
  }

  // Add worksheet to workbook
  XLSX.utils.book_append_sheet(workbook, worksheet, "Investments");

  // Generate Excel file and trigger download
  XLSX.writeFile(workbook, filename);
};
