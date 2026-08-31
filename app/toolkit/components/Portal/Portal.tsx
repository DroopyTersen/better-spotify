import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export const Portal = ({ children, selector }: PortalProps) => {
  const [target, setTarget] = useState<Element | null>(null);

  useEffect(() => {
    setTarget(document.querySelector(selector));
  }, [selector]);

  return target ? createPortal(children, target) : null;
};

interface PortalProps {
  children: ReactNode;
  selector: string;
}
