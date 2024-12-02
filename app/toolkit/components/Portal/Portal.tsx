import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export const Portal = ({ children, selector }: PortalProps) => {
  const [hasMounted, setHasMounted] = useState(false);
  const domRef = useRef(null);

  useEffect(() => {
    // @ts-ignore
    domRef.current = document.querySelector(selector);
  });
  useEffect(() => {
    // @ts-ignore
    domRef.current = document.querySelector(selector);
    setHasMounted(true);
  }, []);

  if (!hasMounted) {
    return null;
  }

  if (!domRef.current) {
    // console.error("Unable to find dom element", selector);
    return null;
  }

  return createPortal(children, domRef.current);
};

interface PortalProps {
  children: React.ReactNode;
  selector: string;
}
