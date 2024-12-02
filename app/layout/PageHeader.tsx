import { Portal } from "~/toolkit/components/Portal/Portal";

export const PageHeader = ({ title }: { title: string }) => {
  return <Portal selector="#page-title">{title}</Portal>;
};
