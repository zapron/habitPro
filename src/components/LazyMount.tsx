import React, { useRef } from 'react';

interface LazyMountProps {
  visible: boolean;
  children: React.ReactNode;
}

export const LazyMount = React.memo(({ visible, children }: LazyMountProps) => {
  const hasMounted = useRef(false);

  if (visible) {
    hasMounted.current = true;
  }

  if (!hasMounted.current) {
    return null;
  }

  return <>{children}</>;
});

LazyMount.displayName = 'LazyMount';
