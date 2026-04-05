import React, { useEffect, useState } from 'react';

interface CosmicParallaxBgProps {
  /**
   * Main heading text (displayed large in the center)
   */
  head: string;
  
  /**
   * Subtitle text (displayed below the heading)
   * Comma-separated string that will be split into animated parts
   */
  text: string;
  
  /**
   * Whether the text animations should loop
   * @default true
   */
  loop?: boolean;
  
  /**
   * Custom class name for additional styling
   */
  className?: string;
}

/**
 * A cosmic parallax background component with animated stars and text
 */
const CosmicParallaxBg: React.FC<CosmicParallaxBgProps> = ({
  head,
  text,
  loop = true,
  className = '',
}) => {
  const [smallStars, setSmallStars] = useState<string>('');
  const [mediumStars, setMediumStars] = useState<string>('');
  const [bigStars, setBigStars] = useState<string>('');
  
  // Split the text by commas and trim whitespace
  const textParts = text.split(',').map(part => part.trim());
  
  // Generate random star positions
  const generateStarBoxShadow = (count: number): string => {
    let shadows = [];
    
    for (let i = 0; i < count; i++) {
      const x = Math.floor(Math.random() * 2000);
      const y = Math.floor(Math.random() * 2000);
      shadows.push(`${x}px ${y}px #FFF`);
    }
    
    return shadows.join(', ');
  };
  
  useEffect(() => {
    // Generate star shadows when component mounts
    setSmallStars(generateStarBoxShadow(700));
    setMediumStars(generateStarBoxShadow(200));
    setBigStars(generateStarBoxShadow(100));
    
    // Set animation iteration based on loop prop
    document.documentElement.style.setProperty(
      '--animation-iteration', 
      loop ? 'infinite' : '1'
    );
  }, [loop]);
  
  return (
    <>
      {/* Fixed Cosmic Background */}
      <div className={`fixed inset-0 z-[-1] overflow-hidden bg-[#10141a] pointer-events-none ${className}`}>
        {/* Stars layers */}
        <div 
          id="stars" 
          style={{ boxShadow: smallStars }}
          className="cosmic-stars absolute top-0 left-0 w-[1px] h-[1px] bg-transparent animate-[animStar_50s_linear_infinite]"
        ></div>
        <div 
          id="stars2" 
          style={{ boxShadow: mediumStars }}
          className="cosmic-stars-medium absolute top-0 left-0 w-[2px] h-[2px] bg-transparent animate-[animStar_100s_linear_infinite]"
        ></div>
        <div 
          id="stars3" 
          style={{ boxShadow: bigStars }}
          className="cosmic-stars-large absolute top-0 left-0 w-[3px] h-[3px] bg-transparent animate-[animStar_150s_linear_infinite]"
        ></div>
        
        {/* Horizon and Earth themed for AuthentiChain */}
        <div id="horizon" className="absolute bottom-0 w-full h-[50%] bg-gradient-to-t from-[#00201b] to-transparent">
          <div className="glow absolute top-[-50px] w-full h-[100px] bg-[#71ffe8]/10 blur-3xl rounded-[100%]"></div>
        </div>
        <div id="earth" className="absolute bottom-[-50vw] left-[-50vw] w-[200vw] h-[200vw] rounded-[100%] border border-[#71ffe8]/20 shadow-[0_0_100px_inset_rgba(113,255,232,0.15)] bg-gradient-to-t from-transparent to-[#00e5cc]/10"></div>
      </div>
      
      {/* Scrollable Title and subtitle */}
      <div className="relative z-10 flex flex-col items-center justify-center w-full min-h-[45vh] pt-32 pb-16 px-4">
        <div id="title" className="text-4xl md:text-5xl lg:text-7xl font-bold tracking-[15px] mb-8 font-headline text-transparent bg-clip-text bg-gradient-to-b from-[#dfe2eb] to-[#71ffe8]/70 text-center">
          {head.toUpperCase()}
        </div>
        <div id="subtitle" className="text-xs md:text-base lg:text-lg tracking-[8px] font-mono text-[#849490] text-center">
          {textParts.map((part, index) => (
            <React.Fragment key={index}>
              <span className={`subtitle-part-${index + 1}`}>{part.toUpperCase()}</span>
              {index < textParts.length - 1 && ' '}
            </React.Fragment>
          ))}
        </div>
      </div>
    </>
  );
};

export {CosmicParallaxBg}
