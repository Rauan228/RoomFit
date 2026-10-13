import { STARTER_ROOMS, type StarterKey } from "../../../shared/starter-rooms";
import { FurnitureArtwork } from "../../../platform/src/FurnitureArtwork";

export default function GuidePlan({
  template,
  cover = false,
}: {
  template: StarterKey;
  cover?: boolean;
}) {
  const room = STARTER_ROOMS[template];
  const scale = Math.min(460 / room.w, 350 / room.h);
  const x = (600 - room.w * scale) / 2,
    y = 55;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 600 480"
      role="img"
      aria-label={`${room.name}: ${room.w} × ${room.h} см, мебель, дверь и окно`}
    >
      <title>{`${room.name} — учебная схема RoomFit`}</title>
      <rect width="600" height="480" rx={cover ? 0 : 24} fill="#f2efe6" />
      <text
        x="300"
        y="29"
        textAnchor="middle"
        fill="#545950"
        fontSize="16"
        fontFamily="sans-serif"
      >
        {room.w} см
      </text>
      <g transform={`translate(${x} ${y}) scale(${scale})`}>
        <rect
          width={room.w}
          height={room.h}
          fill="#e8dece"
          stroke="#414b42"
          strokeWidth="9"
        />
        {Array.from({ length: Math.floor(room.w / 16) }, (_, i) => (
          <path
            key={i}
            d={`M${i * 16} 0V${room.h}`}
            stroke="#dacebb"
            strokeWidth="0.7"
          />
        ))}
        {room.windows.map((opening, i) => (
          <g key={i}>
            <rect
              x={opening.at}
              y="-5"
              width={opening.w}
              height="10"
              fill="#e4f0ee"
              stroke="#688c87"
              strokeWidth="2"
            />
            <path
              d={`M${opening.at} 0h${opening.w}`}
              stroke="#688c87"
              strokeWidth="1"
            />
          </g>
        ))}
        {room.doors.map((opening, i) => (
          <g key={i}>
            <rect
              x={opening.at}
              y={room.h - 7}
              width={opening.w}
              height="14"
              fill="#f2efe6"
            />
            <path
              d={`M${opening.at} ${room.h}v-${opening.w}a${opening.w} ${opening.w} 0 0 1 ${opening.w} ${opening.w}Z`}
              fill="#8fa28518"
              stroke="#8a977e"
              strokeWidth="1.5"
              strokeDasharray="4 3"
            />
            <path
              d={`M${opening.at} ${room.h}v-${opening.w}`}
              stroke="#414b42"
              strokeWidth="3"
            />
          </g>
        ))}
        {room.items.map((item) => {
          const angle = "rot" in item ? (item.rot ?? 0) : 0;
          const turned = angle % 180 !== 0;
          const width = turned ? item.h : item.w,
            depth = turned ? item.w : item.h;
          return (
            <g
              key={item.id}
              transform={`translate(${item.x + width / 2} ${item.y + depth / 2}) rotate(${angle})`}
            >
              <svg
                x={-item.w / 2}
                y={-item.h / 2}
                width={item.w}
                height={item.h}
                viewBox="0 0 1000 1000"
                preserveAspectRatio="none"
              >
                <FurnitureArtwork
                  type={item.type}
                  catalogId={item.catalogId}
                  color={
                    item.type === "sofa" || item.type === "chair"
                      ? "#95a28a"
                      : "#cbb99e"
                  }
                  width={item.w}
                  depth={item.h}
                />
              </svg>
            </g>
          );
        })}
      </g>
      <text
        x={x + room.w * scale + 21}
        y={y + (room.h * scale) / 2}
        transform={`rotate(90 ${x + room.w * scale + 21} ${y + (room.h * scale) / 2})`}
        textAnchor="middle"
        fill="#545950"
        fontSize="16"
        fontFamily="sans-serif"
      >
        {room.h} см
      </text>
      <text
        x="300"
        y="447"
        textAnchor="middle"
        fill="#414b42"
        fontSize="17"
        fontFamily="sans-serif"
      >
        {room.name} · RoomFit
      </text>
    </svg>
  );
}
