import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { ExternalLink } from "lucide-react";
import type { Investment } from "@/pages/Index";

interface InvestmentTableProps {
  investments: Investment[];
}

export const InvestmentTable = ({ investments }: InvestmentTableProps) => {
  return (
    <div className="border rounded-lg overflow-hidden">
      <div className="overflow-x-auto max-h-[600px]">
        <Table>
          <TableHeader className="sticky top-0 bg-muted z-10">
            <TableRow>
              <TableHead className="font-semibold">Investment Name</TableHead>
              <TableHead className="font-semibold">Industry</TableHead>
              <TableHead className="font-semibold">Date</TableHead>
              <TableHead className="font-semibold">Description</TableHead>
              <TableHead className="font-semibold">Partners</TableHead>
              <TableHead className="font-semibold">Link</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {investments.map((investment, index) => (
              <TableRow key={index} className="hover:bg-muted/50 transition-colors">
                <TableCell className="font-medium max-w-xs">
                  {investment.name}
                </TableCell>
                <TableCell>
                  {investment.industry ? (
                    <Badge variant="secondary" className="text-xs">
                      {investment.industry}
                    </Badge>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell className="text-sm">
                  {investment.date || <span className="text-muted-foreground">—</span>}
                </TableCell>
                <TableCell className="max-w-md">
                  <div className="text-sm text-muted-foreground line-clamp-2">
                    {investment.description || "—"}
                  </div>
                </TableCell>
                <TableCell>
                  {investment.partners && investment.partners.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {investment.partners.map((partner, idx) => (
                        <Badge key={idx} variant="outline" className="text-xs">
                          {partner}
                        </Badge>
                      ))}
                    </div>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
                <TableCell>
                  {investment.portfolioUrl ? (
                    <a
                      href={investment.portfolioUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-primary hover:underline text-sm"
                    >
                      View
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  ) : (
                    <span className="text-muted-foreground text-sm">—</span>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
};
