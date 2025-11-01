import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { ExternalLink, ArrowUpDown, ArrowUp, ArrowDown, Search } from "lucide-react";
import type { Investment } from "@/pages/Index";

interface InvestmentTableProps {
  investments: Investment[];
}

type SortField = keyof Investment | null;
type SortDirection = "asc" | "desc" | null;

export const InvestmentTable = ({ investments }: InvestmentTableProps) => {
  const [sortField, setSortField] = useState<SortField>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [searchQuery, setSearchQuery] = useState("");

  // Handle sorting
  const handleSort = (field: keyof Investment) => {
    if (sortField === field) {
      // Cycle through: asc -> desc -> null
      if (sortDirection === "asc") {
        setSortDirection("desc");
      } else if (sortDirection === "desc") {
        setSortField(null);
        setSortDirection(null);
      }
    } else {
      setSortField(field);
      setSortDirection("asc");
    }
  };

  // Filter and sort data
  const filteredAndSortedInvestments = useMemo(() => {
    let result = [...investments];

    // Apply search filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter((inv) => {
        return (
          inv.name.toLowerCase().includes(query) ||
          inv.industry?.toLowerCase().includes(query) ||
          inv.description?.toLowerCase().includes(query) ||
          inv.date?.toLowerCase().includes(query) ||
          inv.partners?.some(p => p.toLowerCase().includes(query))
        );
      });
    }

    // Apply sorting
    if (sortField && sortDirection) {
      result.sort((a, b) => {
        const aVal = a[sortField];
        const bVal = b[sortField];

        // Handle undefined/null values
        if (!aVal && !bVal) return 0;
        if (!aVal) return sortDirection === "asc" ? 1 : -1;
        if (!bVal) return sortDirection === "asc" ? -1 : 1;

        // Handle array values (partners)
        if (Array.isArray(aVal) && Array.isArray(bVal)) {
          const aStr = aVal.join(", ");
          const bStr = bVal.join(", ");
          return sortDirection === "asc" 
            ? aStr.localeCompare(bStr) 
            : bStr.localeCompare(aStr);
        }

        // Handle string values
        const comparison = String(aVal).localeCompare(String(bVal));
        return sortDirection === "asc" ? comparison : -comparison;
      });
    }

    return result;
  }, [investments, searchQuery, sortField, sortDirection]);

  // Sort icon component
  const SortIcon = ({ field }: { field: keyof Investment }) => {
    if (sortField !== field) {
      return <ArrowUpDown className="w-4 h-4 ml-1 text-muted-foreground" />;
    }
    return sortDirection === "asc" 
      ? <ArrowUp className="w-4 h-4 ml-1 text-primary" />
      : <ArrowDown className="w-4 h-4 ml-1 text-primary" />;
  };

  return (
    <div className="space-y-4">
      {/* Search Filter */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          type="text"
          placeholder="Search investments..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Results count */}
      <div className="text-sm text-muted-foreground">
        Showing {filteredAndSortedInvestments.length} of {investments.length} investments
      </div>

      {/* Table */}
      <div className="border rounded-lg overflow-hidden">
        <div className="overflow-x-auto max-h-[600px]">
          <Table>
            <TableHeader className="sticky top-0 bg-muted z-10">
              <TableRow>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("name")}
                    className="hover:bg-muted-foreground/10 font-semibold flex items-center"
                  >
                    Investment Name
                    <SortIcon field="name" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("industry")}
                    className="hover:bg-muted-foreground/10 font-semibold flex items-center"
                  >
                    Industry
                    <SortIcon field="industry" />
                  </Button>
                </TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("date")}
                    className="hover:bg-muted-foreground/10 font-semibold flex items-center"
                  >
                    Date
                    <SortIcon field="date" />
                  </Button>
                </TableHead>
                <TableHead className="font-semibold">Description</TableHead>
                <TableHead>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleSort("partners")}
                    className="hover:bg-muted-foreground/10 font-semibold flex items-center"
                  >
                    Partners
                    <SortIcon field="partners" />
                  </Button>
                </TableHead>
                <TableHead className="font-semibold">Link</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredAndSortedInvestments.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No investments match your search
                  </TableCell>
                </TableRow>
              ) : (
                filteredAndSortedInvestments.map((investment, index) => (
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
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    </div>
  );
};
