import React, { useRef, useState, useCallback, useEffect } from 'react';

interface VirtualJoystickProps {
  onDirectionChange: (dirs: { up: boolean; down: boolean; left: boolean; right: boolean }) => void;
  size?: number; // Outer diameter in px (default 140)
  disabled?: boolean;
  onHaptic?: (ms: number) => void;
}

export const VirtualJoystick: React.FC<VirtualJoystickProps> = ({
  onDirectionChange,
  size = 140,
  disabled = false,
  onHaptic,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const activePointerIdRef = useRef<number | null>(null);

  // Knob displacement from center in px
  const [knobPos, setKnobPos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const currentDirsRef = useRef<{ up: boolean; down: boolean; left: boolean; right: boolean }>({
    up: false,
    down: false,
    left: false,
    right: false,
  });

  const onDirectionChangeRef = useRef(onDirectionChange);
  onDirectionChangeRef.current = onDirectionChange;

  const onHapticRef = useRef(onHaptic);
  onHapticRef.current = onHaptic;

  const maxRadius = (size / 2) - 18; // Maximum travel distance for knob center
  const deadZone = 12; // Deadzone in px to prevent micro-drift

  const updateDirections = useCallback(
    (dx: number, dy: number) => {
      const distance = Math.sqrt(dx * dx + dy * dy);

      if (distance < deadZone) {
        // In deadzone: release all directions
        const wasActive =
          currentDirsRef.current.up ||
          currentDirsRef.current.down ||
          currentDirsRef.current.left ||
          currentDirsRef.current.right;

        if (wasActive) {
          currentDirsRef.current = { up: false, down: false, left: false, right: false };
          onDirectionChangeRef.current(currentDirsRef.current);
        }
        return;
      }

      // Calculate angle in degrees:
      // Note: In screen coords, dy is positive downwards.
      // -dy makes Up positive.
      // Angle in radians: Math.atan2(-dy, dx)
      // Angle in degrees: 0 = Right, 90 = Up, 180/-180 = Left, -90 = Down
      let deg = (Math.atan2(-dy, dx) * 180) / Math.PI;

      // 8-way directional sector mapping (each sector is 45 degrees, centered on 0, 45, 90, etc.)
      let up = false;
      let down = false;
      let left = false;
      let right = false;

      if (deg >= -22.5 && deg < 22.5) {
        // Pure Right
        right = true;
      } else if (deg >= 22.5 && deg < 67.5) {
        // Up-Right
        up = true;
        right = true;
      } else if (deg >= 67.5 && deg < 112.5) {
        // Pure Up
        up = true;
      } else if (deg >= 112.5 && deg < 157.5) {
        // Up-Left
        up = true;
        left = true;
      } else if (deg >= 157.5 || deg < -157.5) {
        // Pure Left
        left = true;
      } else if (deg >= -157.5 && deg < -112.5) {
        // Down-Left
        down = true;
        left = true;
      } else if (deg >= -112.5 && deg < -67.5) {
        // Pure Down
        down = true;
      } else if (deg >= -67.5 && deg < -22.5) {
        // Down-Right
        down = true;
        right = true;
      }

      const prev = currentDirsRef.current;
      const changed =
        prev.up !== up || prev.down !== down || prev.left !== left || prev.right !== right;

      if (changed) {
        currentDirsRef.current = { up, down, left, right };
        onDirectionChangeRef.current({ up, down, left, right });
        onHapticRef.current?.(12);
      }
    },
    [deadZone]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (disabled) return;
    e.preventDefault();
    e.stopPropagation();

    const target = e.currentTarget;
    target.setPointerCapture(e.pointerId);
    activePointerIdRef.current = e.pointerId;
    setIsDragging(true);

    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobPos({ x: dx, y: dy });
    updateDirections(dx, dy);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || activePointerIdRef.current !== e.pointerId) return;
    e.preventDefault();
    e.stopPropagation();

    const target = containerRef.current;
    if (!target) return;

    const rect = target.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;

    let dx = e.clientX - centerX;
    let dy = e.clientY - centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (dist > maxRadius) {
      dx = (dx / dist) * maxRadius;
      dy = (dy / dist) * maxRadius;
    }

    setKnobPos({ x: dx, y: dy });
    updateDirections(dx, dy);
  };

  const resetJoystick = useCallback(() => {
    setIsDragging(false);
    activePointerIdRef.current = null;
    setKnobPos({ x: 0, y: 0 });

    const wasActive =
      currentDirsRef.current.up ||
      currentDirsRef.current.down ||
      currentDirsRef.current.left ||
      currentDirsRef.current.right;

    if (wasActive) {
      currentDirsRef.current = { up: false, down: false, left: false, right: false };
      onDirectionChangeRef.current(currentDirsRef.current);
    }
  }, []);

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current === e.pointerId) {
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {}
      resetJoystick();
    }
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activePointerIdRef.current === e.pointerId) {
      resetJoystick();
    }
  };

  // Safe cleanup on unmount only
  useEffect(() => {
    return () => {
      const wasActive =
        currentDirsRef.current.up ||
        currentDirsRef.current.down ||
        currentDirsRef.current.left ||
        currentDirsRef.current.right;
      if (wasActive) {
        currentDirsRef.current = { up: false, down: false, left: false, right: false };
        onDirectionChangeRef.current({ up: false, down: false, left: false, right: false });
      }
    };
  }, []);

  const activeDirs = currentDirsRef.current;

  return (
    <div
      ref={containerRef}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        touchAction: 'none',
      }}
      className={`relative rounded-full select-none flex items-center justify-center transition-shadow ${
        isDragging
          ? 'bg-[#0f1118]/90 border-2 border-[#4cd7f6]/80 shadow-[0_0_24px_rgba(76,215,246,0.3)]'
          : 'bg-[#0c0e14]/80 border-2 border-[#494454]/60 shadow-xl'
      } backdrop-blur-md cursor-grab active:cursor-grabbing`}
    >
      {/* Direction Guide Marks */}
      <div className="absolute inset-2 rounded-full border border-dashed border-[#494454]/30 pointer-events-none" />

      {/* Up Indicator */}
      <div
        className={`absolute top-2 w-2 h-2 rounded-full transition-colors ${
          activeDirs.up ? 'bg-[#4cd7f6] shadow-[0_0_8px_#4cd7f6]' : 'bg-[#494454]/40'
        }`}
      />
      {/* Down Indicator */}
      <div
        className={`absolute bottom-2 w-2 h-2 rounded-full transition-colors ${
          activeDirs.down ? 'bg-[#4cd7f6] shadow-[0_0_8px_#4cd7f6]' : 'bg-[#494454]/40'
        }`}
      />
      {/* Left Indicator */}
      <div
        className={`absolute left-2 w-2 h-2 rounded-full transition-colors ${
          activeDirs.left ? 'bg-[#4cd7f6] shadow-[0_0_8px_#4cd7f6]' : 'bg-[#494454]/40'
        }`}
      />
      {/* Right Indicator */}
      <div
        className={`absolute right-2 w-2 h-2 rounded-full transition-colors ${
          activeDirs.right ? 'bg-[#4cd7f6] shadow-[0_0_8px_#4cd7f6]' : 'bg-[#494454]/40'
        }`}
      />

      {/* Center Deadzone Circle Base */}
      <div className="w-8 h-8 rounded-full bg-[#181a24] border border-[#494454]/50 pointer-events-none flex items-center justify-center">
        <div className="w-2 h-2 rounded-full bg-[#494454]/60" />
      </div>

      {/* Draggable Thumbstick Knob */}
      <div
        style={{
          transform: `translate3d(${knobPos.x}px, ${knobPos.y}px, 0)`,
          transition: isDragging ? 'none' : 'transform 160ms cubic-bezier(0.18, 0.89, 0.32, 1.28)',
          width: `${size * 0.42}px`,
          height: `${size * 0.42}px`,
        }}
        className={`absolute rounded-full flex items-center justify-center pointer-events-none shadow-2xl ${
          isDragging
            ? 'bg-gradient-to-b from-[#3a3d4c] to-[#1c1e27] border-2 border-[#4cd7f6] shadow-[0_6px_20px_rgba(0,0,0,0.8),0_0_15px_rgba(76,215,246,0.5)]'
            : 'bg-gradient-to-b from-[#2a2c38] to-[#161720] border-2 border-[#5a5568] shadow-[0_6px_16px_rgba(0,0,0,0.7)]'
        }`}
      >
        {/* Concentric Thumb Grip Rings */}
        <div className="w-3/4 h-3/4 rounded-full border border-[#494454]/80 flex items-center justify-center bg-radial from-[#2d303d] to-[#191a24]">
          <div className="w-1/2 h-1/2 rounded-full border border-[#4cd7f6]/40 flex items-center justify-center">
            <div
              className={`w-2 h-2 rounded-full transition-all ${
                isDragging ? 'bg-[#4cd7f6] shadow-[0_0_6px_#4cd7f6]' : 'bg-[#6b6579]'
              }`}
            />
          </div>
        </div>
      </div>
    </div>
  );
};
