import '../styles.css';

const ROOM_COORDINATES: Record<string, { x: number; y: number }> = {
  // Soglio House Layout (Vertical 3-story map mapping)
  'Entryway': { x: 50, y: 85 },
  'Mudroom': { x: 50, y: 85 },
  'Living Room': { x: 50, y: 50 },
  'Observatory': { x: 70, y: 50 },
  'Hearth': { x: 50, y: 50 },
  'Bedroom': { x: 50, y: 15 },
  'Master Bedroom': { x: 50, y: 15 },
  'Bathroom': { x: 70, y: 15 },
};

interface FloorPlanPanelProps {
  scarlettLocation?: string;
  benjaminLocation?: string;
}

export function FloorPlanPanel({ scarlettLocation, benjaminLocation }: FloorPlanPanelProps) {
  // Fallback to Hearth if location not found
  const scarlettCoords = ROOM_COORDINATES[scarlettLocation || ''] || ROOM_COORDINATES['Hearth'];
  const benjaminCoords = ROOM_COORDINATES[benjaminLocation || ''] || ROOM_COORDINATES['Hearth'];

  return (
    <div className="card floor-plan-panel">
      <h3>Interactive Floor Plan (Marauder's Map)</h3>
      <div 
        style={{
          position: 'relative',
          width: '100%',
          height: '400px',
          backgroundColor: '#2a2a2a',
          backgroundImage: 'url(/location-photos/soglio-stone-house/image_5bc944.jpg)',
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          borderRadius: '8px',
          marginTop: '12px',
          overflow: 'hidden'
        }}
      >

        {scarlettCoords && (
          <div
            title={`Scarlett - ${scarlettLocation}`}
            style={{
              position: 'absolute',
              left: `${scarlettCoords.x}%`,
              top: `${scarlettCoords.y}%`,
              width: '12px',
              height: '12px',
              backgroundColor: '#ff4444',
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 8px 2px rgba(255, 68, 68, 0.6)'
            }}
          />
        )}
        
        {benjaminCoords && (
          <div
            title={`Benjamin - ${benjaminLocation}`}
            style={{
              position: 'absolute',
              left: `${benjaminCoords.x}%`,
              top: `${benjaminCoords.y}%`,
              width: '12px',
              height: '12px',
              backgroundColor: '#4444ff',
              borderRadius: '50%',
              transform: 'translate(-50%, -50%)',
              boxShadow: '0 0 8px 2px rgba(68, 68, 255, 0.6)'
            }}
          />
        )}
      </div>
    </div>
  );
}
