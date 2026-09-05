import '../styles.css';

const ROOM_COORDINATES: Record<string, { x: number; y: number }> = {
  'Kitchen': { x: 20, y: 30 },
  'Living Room': { x: 60, y: 70 },
  'Bedroom': { x: 80, y: 30 },
  'Bathroom': { x: 40, y: 80 },
  'Hallway': { x: 50, y: 50 },
  'Study': { x: 20, y: 70 },
  'Balcony': { x: 80, y: 70 },
  'Dining Room': { x: 40, y: 30 },
  'Garage': { x: 10, y: 90 },
  'Basement': { x: 90, y: 90 },
};

interface FloorPlanPanelProps {
  scarlettLocation?: string;
  benjaminLocation?: string;
}

export function FloorPlanPanel({ scarlettLocation, benjaminLocation }: FloorPlanPanelProps) {
  const scarlettCoords = scarlettLocation ? ROOM_COORDINATES[scarlettLocation] : null;
  const benjaminCoords = benjaminLocation ? ROOM_COORDINATES[benjaminLocation] : null;

  return (
    <div className="card floor-plan-panel">
      <h3>Interactive Floor Plan (Marauder's Map)</h3>
      <div 
        style={{
          position: 'relative',
          width: '100%',
          height: '250px',
          backgroundColor: '#2a2a2a',
          borderRadius: '8px',
          marginTop: '12px',
          overflow: 'hidden'
        }}
      >
        {/* Placeholder text for map */}
        <div style={{ position: 'absolute', top: '10px', left: '10px', color: '#666', fontSize: '12px' }}>
          Map Placeholder
        </div>

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
