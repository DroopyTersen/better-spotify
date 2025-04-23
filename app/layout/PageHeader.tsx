import { Portal } from "~/toolkit/components/Portal/Portal";
import { ReactNode } from "react";

export const PageHeader = ({ children }: { children: ReactNode }) => {
  return <Portal selector="#page-title">{children}</Portal>;
};
