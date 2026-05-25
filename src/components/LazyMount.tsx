import React, { useEffect, useRef, useState } from 'react';

interface LazyMountProps {
  visible: boolean;
  children: React.ReactNode;
  unmountOnExit?: boolean;
  unmountDelayMs?: number;
}

export const LazyMount = React.memo(({ visible, children, unmountOnExit = false, unmountDelayMs = 120 }: LazyMountProps) => {
  const hasMounted = useRef(false);
  const [mounted, setMounted] = useState(visible);

  if (visible) {
    hasMounted.current = true;
  }

  useEffect(() => {
    if (visible) {
      hasMounted.current = true;
      setMounted(true);
      return undefined;
    }
    if (!unmountOnExit) return undefined;
    const t = setTimeout(() => setMounted(false), Math.max(0, unmountDelayMs));
    return () => clearTimeout(t);
  }, [unmountDelayMs, unmountOnExit, visible]);

  if (!hasMounted.current) {
    return null;
  }

  if (unmountOnExit && !mounted && !visible) {
    return null;
  }

  return <>{children}</>;
});

LazyMount.displayName = 'LazyMount';
