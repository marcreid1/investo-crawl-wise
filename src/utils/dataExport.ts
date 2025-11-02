import * as XLSX from "xlsx";
import type { Investment } from "@/pages/Index";
import type { OutputFormat } from "@/lib/settings";

// Clean text utility to ensure single-line, clean output
function cleanExportText(text: string | undefined): string {
  if (!text) return "";
  return text
    .replace(/[\r\n\t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

// Export to Excel
export const exportToExcel = (investments: Investment[], filename: string = "investments_data.xlsx") => {
  const excelData = investments.map((inv) => ({
    "Investment Name": cleanExportText(inv.name),
    "Industry": cleanExportText(inv.industry),
    "CEO": cleanExportText(inv.ceo),
    "Ironbridge Investment Role": cleanExportText(inv.investmentRole),
    "Ironbridge Ownership": cleanExportText(inv.ownership),
    "Year of Initial Investment": cleanExportText(inv.year),
    "Location": cleanExportText(inv.location),
    "Website": cleanExportText(inv.website),
    "Status": cleanExportText(inv.status),
    "Date": cleanExportText(inv.date),
    "Description": cleanExportText(inv.description),
    "Partners": inv.partners ? inv.partners.map(p => cleanExportText(p)).join(", ") : "",
    "Portfolio URL": inv.portfolioUrl || "",
    "Source URL": inv.sourceUrl || "",
  }));

  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.json_to_sheet(excelData);

  const columnWidths = [
    { wch: 30 }, // Investment Name
    { wch: 20 }, // Industry
    { wch: 20 }, // CEO
    { wch: 25 }, // Investment Role
    { wch: 20 }, // Ownership
    { wch: 15 }, // Year
    { wch: 25 }, // Location
    { wch: 30 }, // Website
    { wch: 15 }, // Status
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
    "Investment Name": cleanExportText(inv.name),
    "Industry": cleanExportText(inv.industry),
    "CEO": cleanExportText(inv.ceo),
    "Ironbridge Investment Role": cleanExportText(inv.investmentRole),
    "Ironbridge Ownership": cleanExportText(inv.ownership),
    "Year of Initial Investment": cleanExportText(inv.year),
    "Location": cleanExportText(inv.location),
    "Website": cleanExportText(inv.website),
    "Status": cleanExportText(inv.status),
    "Date": cleanExportText(inv.date),
    "Description": cleanExportText(inv.description),
    "Partners": inv.partners ? inv.partners.map(p => cleanExportText(p)).join("; ") : "",
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
  // Clean investments before JSON export
  const cleanedInvestments = investments.map(inv => ({
    name: cleanExportText(inv.name),
    industry: inv.industry ? cleanExportText(inv.industry) : undefined,
    ceo: inv.ceo ? cleanExportText(inv.ceo) : undefined,
    investmentRole: inv.investmentRole ? cleanExportText(inv.investmentRole) : undefined,
    ownership: inv.ownership ? cleanExportText(inv.ownership) : undefined,
    year: inv.year ? cleanExportText(inv.year) : undefined,
    location: inv.location ? cleanExportText(inv.location) : undefined,
    website: inv.website ? cleanExportText(inv.website) : undefined,
    status: inv.status ? cleanExportText(inv.status) : undefined,
    date: inv.date ? cleanExportText(inv.date) : undefined,
    description: inv.description ? cleanExportText(inv.description) : undefined,
    partners: inv.partners?.map(p => cleanExportText(p)),
    portfolioUrl: inv.portfolioUrl,
    sourceUrl: inv.sourceUrl,
  }));
  
  const jsonString = JSON.stringify(cleanedInvestments, null, 2);
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
