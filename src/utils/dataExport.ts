import * as XLSX from "xlsx";
import type { Investment } from "@/pages/Index";
import type { OutputFormat } from "@/lib/settings";

// Export to Excel
export const exportToExcel = (investments: Investment[], filename: string = "investments_data.xlsx") => {
  const excelData = investments.map((inv) => ({
    "Investment Name": inv.name || "",
    "Industry": inv.industry || "",
    "Date": inv.date || "",
    "Description": inv.description || "",
    "Partners": inv.partners ? inv.partners.join(", ") : "",
    "Portfolio URL": inv.portfolioUrl || "",
    "Source URL": inv.sourceUrl || "",
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(excelData);

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

  XLSX.utils.book_append_sheet(workbook, worksheet, "Investments");
  XLSX.writeFile(workbook, filename);
};

// Export to CSV
export const exportToCSV = (investments: Investment[], filename: string = "investments_data.csv") => {
  const csvData = investments.map((inv) => ({
    "Investment Name": inv.name || "",
    "Industry": inv.industry || "",
    "Date": inv.date || "",
    "Description": inv.description || "",
    "Partners": inv.partners ? inv.partners.join("; ") : "",
    "Portfolio URL": inv.portfolioUrl || "",
    "Source URL": inv.sourceUrl || "",
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(csvData);
  XLSX.utils.book_append_sheet(workbook, worksheet, "Investments");
  XLSX.writeFile(workbook, filename, { bookType: "csv" });
};

// Export to JSON
export const exportToJSON = (investments: Investment[], filename: string = "investments_data.json") => {
  const jsonString = JSON.stringify(investments, null, 2);
  const blob = new Blob([jsonString], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// Universal export function that uses settings
export const exportInvestments = (
  investments: Investment[],
  format: OutputFormat,
  baseFilename: string = "investments_data"
) => {
  switch (format) {
    case "excel":
      exportToExcel(investments, `${baseFilename}.xlsx`);
      break;
    case "csv":
      exportToCSV(investments, `${baseFilename}.csv`);
      break;
    case "json":
      exportToJSON(investments, `${baseFilename}.json`);
      break;
    default:
      exportToExcel(investments, `${baseFilename}.xlsx`);
  }
};
