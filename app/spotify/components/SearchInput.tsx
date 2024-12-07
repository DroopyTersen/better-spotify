import { Search } from "lucide-react";
import { Form } from "react-router";
import { Input } from "~/shadcn/components/ui/input";

export function SearchInput() {
  return (
    <Form action="/search" className="relative w-full max-w-sm">
      <Search className="absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        type="search"
        placeholder="Search artists, songs, albums..."
        name="query"
        className="pl-8"
      />
    </Form>
  );
}
