import { Outlet } from "react-router";
import { MainNav } from "./main-nav";
import {
  Sidebar,
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from "~/shadcn/components/ui/sidebar";
import { Separator } from "~/shadcn/components/ui/separator";

export const SidebarLayout = ({ children }: { children: React.ReactNode }) => {
  return (
    <SidebarProvider>
      <MainNav />
      <SidebarInset>
        <header className="flex h-16 items-center gap-4 border-b bg-white px-6">
          <SidebarTrigger />
          <Separator orientation="vertical" className="h-6" />
          <h1 className="text-lg font-bold">Better Spotify</h1>
          <div className="flex-1" />
        </header>
        <main className="flex-1 p-8">{children}</main>
      </SidebarInset>
    </SidebarProvider>
  );
};
