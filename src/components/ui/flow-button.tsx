import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import React from 'react';

interface FlowButtonProps {
  text?: React.ReactNode;
  to?: string;
  onClick?: () => void;
  className?: string;
  variant?: "default" | "dark";
  size?: "sm" | "md" | "full";
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  hideArrow?: boolean;
}

export function FlowButton({ 
  text = "Modern Button", 
  to, 
  onClick, 
  className = "", 
  variant = "default",
  size = "md",
  type = "button",
  disabled = false,
  hideArrow = false
}: FlowButtonProps) {
  const isDark = variant === "dark";
  
  const textColor = isDark ? "text-[#00201b]" : "text-[#71ffe8]";
  const strokeColor = isDark ? "stroke-[#00201b]" : "stroke-[#71ffe8]";
  const borderColor = isDark ? "border-[#00201b]/30" : "border-[#71ffe8]/30";
  const circleColor = isDark ? "bg-[#00201b]" : "bg-[#00e5cc]";
  const hoverTextColor = isDark ? "hover:text-[#71ffe8] group-hover:text-[#71ffe8]" : "hover:text-[#00201b] group-hover:text-[#00201b]";
  const groupHoverStroke = isDark ? "group-hover:stroke-[#71ffe8]" : "group-hover:stroke-[#00201b]";

  let sizeClasses = hideArrow ? "px-6 py-3 text-sm" : "pl-6 pr-10 py-3 text-sm";
  let arrowSize = "w-4 h-4";
  let rightArrowPos = "right-4";
  
  if (size === "sm") {
    sizeClasses = hideArrow ? "px-4 py-2 text-xs" : "pl-4 pr-8 py-2 text-xs";
    arrowSize = "w-3 h-3";
    rightArrowPos = "right-3";
  } else if (size === "full") {
    sizeClasses = "w-full px-8 py-3 text-sm";
  }

  const disabledClasses = disabled ? "opacity-50 cursor-not-allowed pointer-events-none" : "cursor-pointer";

  const baseClasses = `group relative flex items-center justify-center gap-1 overflow-hidden rounded-[100px] border-[1.5px] ${borderColor} bg-transparent font-semibold ${textColor} transition-all duration-[600ms] ease-[cubic-bezier(0.23,1,0.32,1)] hover:border-transparent ${hoverTextColor} hover:rounded-[12px] active:scale-[0.95] ${sizeClasses} ${disabledClasses} ${className}`;

  const content = (
    <>
      {/* Left arrow (arr-2) */}
      {!hideArrow && (
        <ArrowRight 
          className={`absolute ${arrowSize} left-[-25%] ${strokeColor} fill-none z-[9] group-hover:left-4 ${groupHoverStroke} transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]`} 
        />
      )}

      {/* Text */}
      <span className={`relative z-[1] ${hideArrow ? '' : 'group-hover:translate-x-3'} transition-all duration-[800ms] ease-out font-mono tracking-wider uppercase`}>
        {text}
      </span>

      {/* Circle */}
      <span className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 ${circleColor} rounded-[50%] opacity-0 group-hover:w-[1500px] group-hover:h-[1500px] group-hover:opacity-100 transition-all duration-[800ms] ease-[cubic-bezier(0.19,1,0.22,1)]`}></span>

      {/* Right arrow (arr-1) */}
      {!hideArrow && (
        <ArrowRight 
          className={`absolute ${arrowSize} ${rightArrowPos} ${strokeColor} fill-none z-[9] group-hover:right-[-25%] ${groupHoverStroke} transition-all duration-[800ms] ease-[cubic-bezier(0.34,1.56,0.64,1)]`} 
        />
      )}
    </>
  );

  if (to) {
    return (
      <Link to={to} className={baseClasses} onClick={disabled ? undefined : onClick}>
        {content}
      </Link>
    );
  }

  return (
    <button type={type} disabled={disabled} className={baseClasses} onClick={onClick}>
      {content}
    </button>
  );
}
