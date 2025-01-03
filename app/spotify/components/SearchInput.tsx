import { Search } from "lucide-react";
import { Form, useSearchParams } from "react-router";
import { Input } from "~/shadcn/components/ui/input";
import { cn } from "~/shadcn/lib/utils";

export function SearchInput({ className }: { className?: string }) {
  let [searchParams] = useSearchParams();
  let query = searchParams.get("query");
  return (
    <Form
      action="/search"
      className={cn("relative w-full max-w-sm", className)}
    >
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search artists, songs, albums..."
        name="query"
        className="pl-8 bg-secondary"
        defaultValue={query ?? ""}
      />
    </Form>
  );
}
