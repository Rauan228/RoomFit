import { memo, useId, type ReactNode } from "react";

function tint(hex: string, target: string, amount: number) {
  const a = Number.parseInt(hex.slice(1), 16),
    b = Number.parseInt(target.slice(1), 16);
  return `#${[16, 8, 0]
    .map((shift) =>
      Math.round(
        ((a >> shift) & 255) * (1 - amount) + ((b >> shift) & 255) * amount,
      )
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

// All artwork occupies a normalized 1000 × 1000 footprint. The plan supplies
// the actual dimensions and rotation; materials contain no external resources.
export const FurnitureArtwork = memo(function FurnitureArtwork({
  type,
  color,
  width,
  depth,
  catalogId,
}: {
  type: string;
  color: string;
  width: number;
  depth: number;
  catalogId?: string;
}) {
  const id = `furn-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`,
    paint = (name: string) => `url(#${id}-${name})`,
    edge = tint(color, "#393f36", 0.42),
    light = tint(color, "#ffffff", 0.48),
    dark = tint(color, "#28372e", 0.2),
    enamel = color.toLowerCase() === "#cbb99e" ? "#eef2e9" : color,
    ratio = width / depth;
  const rect = (
    x: number,
    y: number,
    w: number,
    h: number,
    fill = paint("surface"),
    radius = 28,
    stroke = edge,
  ) => (
    <rect
      x={x}
      y={y}
      width={w}
      height={h}
      rx={radius}
      fill={fill}
      stroke={stroke}
      strokeWidth="7"
    />
  );
  const circle = (
    x: number,
    y: number,
    r: number,
    fill: string,
    stroke = edge,
  ) => (
    <ellipse
      cx={x}
      cy={y}
      rx={r}
      ry={r * ratio}
      fill={fill}
      stroke={stroke}
      strokeWidth="7"
    />
  );
  const wood = (x: number, y: number, w: number, h: number, radius = 28) => (
    <>
      {rect(x, y + 12, w, h, "#2936291c", radius, "none")}
      {rect(x, y, w, h, paint("surface"), radius)}
      {rect(
        x + 10,
        y + 10,
        w - 20,
        h - 20,
        paint("grain"),
        Math.max(0, radius - 8),
        "none",
      )}
      <path
        d={`M ${x + 24} ${y + 18} H ${x + w - 24}`}
        stroke="#ffffff"
        strokeOpacity=".55"
        strokeWidth="9"
      />
    </>
  );
  const cushion = (
    x: number,
    y: number,
    w: number,
    h: number,
    radius = 60,
    fill = paint("surface"),
  ) => (
    <>
      {rect(x + 5, y + 10, w, h, "#25312926", radius, "none")}
      {rect(x, y, w, h, fill, radius)}
      <rect
        x={x + 16}
        y={y + 16}
        width={w - 32}
        height={h - 32}
        rx={Math.max(4, radius - 12)}
        fill="none"
        stroke="#ffffff"
        strokeOpacity=".38"
        strokeWidth="5"
      />
      <path
        d={`M ${x + 30} ${y + h - 20} H ${x + w - 30}`}
        stroke={edge}
        strokeOpacity=".3"
        strokeWidth="5"
        strokeDasharray="9 12"
      />
    </>
  );
  const handle = (x: number, y: number, w: number) => (
    <>
      <path
        d={`M ${x} ${y + 8} H ${x + w}`}
        stroke="#29382d"
        strokeOpacity=".18"
        strokeWidth="16"
        strokeLinecap="round"
      />
      <path
        d={`M ${x} ${y} H ${x + w}`}
        stroke="#718077"
        strokeWidth="12"
        strokeLinecap="round"
      />
      <path
        d={`M ${x + 5} ${y - 3} H ${x + w - 5}`}
        stroke="#edf0e8"
        strokeWidth="4"
        strokeLinecap="round"
      />
    </>
  );
  const burner = (x: number, y: number, r = 75) => (
    <>
      {circle(x, y, r, "#2a3538", "#8b9b99")}
      {circle(x, y, r * 0.7, "none", "#647774")}
      {circle(x, y, r * 0.12, "#7a8b88", "none")}
    </>
  );
  let artwork: ReactNode;
  switch (type) {
    case "bed": {
      const double = width > 1100,
        kids = catalogId === "bed-kids";
      artwork = (
        <>
          {wood(14, 22, 972, 958, 42)}
          {rect(30, 18, 940, 76, paint("surface"), 24)}
          {rect(55, 108, 890, 832, paint("ceramic"), 46, "#c5c6bb")}
          {rect(68, 290, 864, 628, paint("surface"), 32)}
          <rect
            x="80"
            y="305"
            width="840"
            height="592"
            rx="25"
            fill={paint("weave")}
          />
          {rect(68, 294, 864, 108, light, 22, "none")}
          <path
            d="M 85 391 H 915 M 103 429 Q 86 615 110 836 M 890 448 Q 865 652 904 873"
            fill="none"
            stroke={edge}
            strokeOpacity=".22"
            strokeWidth="9"
          />
          <path
            d="M 116 878 H 884"
            stroke={edge}
            strokeOpacity=".3"
            strokeWidth="5"
            strokeDasharray="9 12"
          />
          {double ? (
            <>
              {cushion(92, 123, 389, 174, 42, paint("linen"))}
              {cushion(519, 123, 389, 174, 42, paint("linen"))}
              <path
                d="M 260 143 Q 252 207 262 276 M 743 146 Q 758 211 747 277"
                stroke="#c4c7bb"
                strokeOpacity=".5"
                fill="none"
                strokeWidth="6"
              />
            </>
          ) : (
            cushion(143, 121, 714, 170, 44, paint("linen"))
          )}
          {kids && (
            <g fill="#fff8ec" opacity=".5">
              {[460, 595, 730].map((y) => (
                <path
                  key={y}
                  d={`M 420 ${y} l 24 -36 24 36 42 12 -34 27 1 43 -33 -22 -36 22 5 -43 -34 -27 Z`}
                />
              ))}
            </g>
          )}
          <path
            d="M 30 93 H 970 M 36 956 H 964"
            stroke={edge}
            strokeOpacity=".35"
            strokeWidth="8"
          />
        </>
      );
      break;
    }
    case "sofa": {
      const count = width >= 2000 ? 3 : 2,
        arm = Math.min(145, 175000 / width),
        seatW = (1000 - arm * 2 - 52) / count;
      artwork = (
        <>
          {rect(28, 42, 944, 930, dark, 78)}
          {cushion(42, 24, 916, 210, 65)}
          {Array.from({ length: count }, (_, i) => (
            <g key={i}>
              {cushion(arm + 26 + i * seatW, 240, seatW - 14, 642, 48)}
              <path
                d={`M ${arm + 65 + i * seatW} 823 H ${arm + (i + 1) * seatW - 24}`}
                stroke={edge}
                strokeOpacity=".22"
                strokeWidth="6"
              />
            </g>
          ))}
          {cushion(17, 118, arm, 800, 58)}
          {cushion(983 - arm, 118, arm, 800, 58)}
          {rect(arm + 34, 887, 932 - arm * 2, 59, dark, 16)}
          <path
            d="M 64 963 V 985 M 936 963 V 985"
            stroke="#625a48"
            strokeWidth="25"
          />
        </>
      );
      break;
    }
    case "armchair":
      artwork = (
        <>
          {rect(58, 45, 884, 907, dark, 140)}
          {cushion(155, 52, 690, 265, 110)}
          {cushion(175, 334, 650, 530, 100)}
          {cushion(36, 158, 160, 715, 78)}
          {cushion(804, 158, 160, 715, 78)}
          <path
            d="M 125 953 V 987 M 875 953 V 987"
            stroke="#6f6551"
            strokeWidth="35"
          />
          <path
            d="M 460 550 H 540 M 500 515 V 585"
            stroke={edge}
            strokeOpacity=".2"
            strokeWidth="6"
          />
        </>
      );
      break;
    case "chair":
      artwork = (
        <>
          {rect(77, 138, 60, 825, dark, 15)}
          {rect(863, 138, 60, 825, dark, 15)}
          {wood(70, 20, 860, 192, 58)}
          {cushion(57, 252, 886, 663, 105, paint("linen"))}
          <path
            d="M 151 856 Q 498 913 849 856"
            fill="none"
            stroke={edge}
            strokeOpacity=".34"
            strokeWidth="7"
          />
          <path
            d="M 165 913 V 970 M 835 913 V 970"
            stroke={edge}
            strokeWidth="28"
          />
        </>
      );
      break;
    case "desk":
      artwork = (
        <>
          {wood(16, 28, 968, 944, 38)}
          {rect(500, 78, 385, 74, "#38443f", 14, "#293730")}
          {rect(520, 86, 345, 27, "#8a9b91", 6, "none")}
          <path
            d="M 692 153 V 260 M 627 264 H 758"
            stroke="#7e8980"
            strokeWidth="20"
            strokeLinecap="round"
          />
          {rect(481, 360, 414, 167, paint("ceramic"), 18, "#bcc6be")}
          <g stroke="#99a69b" strokeWidth="5" opacity=".8">
            {[398, 433, 468].map((y) => (
              <path key={y} d={`M 503 ${y} H 870`} />
            ))}
            {[546, 600, 654, 708, 762, 816].map((x) => (
              <path key={x} d={`M ${x} 382 V 480`} />
            ))}
          </g>
          {rect(93, 254, 263, 485, "#ececdf", 16, "#aab09f")}
          <path
            d="M 225 269 V 720 M 254 347 H 327 M 254 389 H 327 M 122 347 H 199 M 122 389 H 199"
            stroke="#b5bbad"
            strokeWidth="5"
          />
          <path
            d="M 402 535 V 825"
            stroke="#9c8561"
            strokeWidth="13"
            strokeLinecap="round"
          />
          {circle(924, 100, 14, "#6d7b71", "none")}
        </>
      );
      break;
    case "table":
      artwork = (
        <>
          {wood(12, 24, 976, 952, 90)}
          <rect
            x="48"
            y="69"
            width="904"
            height="859"
            rx="64"
            fill="none"
            stroke={light}
            strokeWidth="8"
          />
          {[215, 785].flatMap((x) =>
            [230, 770].map((y) => (
              <g key={`${x}-${y}`}>
                {circle(x, y, 82, "#ffffffa6", "#d1cec0")}
                {circle(x, y, 56, "#f5f4eb", "#c9c9bd")}
                <path
                  d={`M ${x - 112} ${y - 50} V ${y + 50} M ${x + 112} ${y - 50} V ${y + 50}`}
                  stroke="#7e877d"
                  strokeWidth="7"
                  strokeLinecap="round"
                />
              </g>
            )),
          )}
          {circle(500, 500, 85, "#e5e8d7", "#9eaa92")}
          {circle(473, 465, 31, "#a6b08a", "none")}
          {circle(524, 528, 29, "#c1aa79", "none")}
        </>
      );
      break;
    case "coffee":
      artwork = (
        <>
          {wood(15, 30, 970, 937, 132)}
          <g transform="rotate(-8 310 500)">
            {rect(130, 257, 328, 480, "#b9c6b2", 13, "#778a76")}
            {rect(162, 230, 302, 475, "#f1eee1", 10, "#d0cebe")}
            <path
              d="M 178 245 V 690 M 225 330 H 405 M 225 355 H 370"
              stroke="#b2b9a5"
              strokeWidth="7"
            />
          </g>
          {circle(739, 512, 110, "#e7e8dc", "#babfaf")}
          {circle(735, 500, 73, "#fcfaf1", "#c4c6b8")}
          {circle(735, 500, 52, "#947351", "#776348")}
          <path
            d="M 806 452 Q 891 436 881 518 Q 872 547 813 538"
            fill="none"
            stroke="#dddcd0"
            strokeWidth="17"
          />
        </>
      );
      break;
    case "wardrobe": {
      const doors = width >= 1500 ? 3 : 2;
      artwork = (
        <>
          {wood(10, 24, 980, 954, 15)}
          {Array.from({ length: doors }, (_, i) => (
            <g key={i}>
              {rect(
                25 + (i * 950) / doors,
                46,
                950 / doors - 7,
                800,
                paint("surface"),
                8,
              )}
              <rect
                x={35 + (i * 950) / doors}
                y="56"
                width={950 / doors - 28}
                height="775"
                fill={paint("grain")}
              />
              {handle(25 + ((i + 0.5) * 950) / doors - 31, 888, 62)}
            </g>
          ))}
          <path d="M 24 948 H 976" stroke={edge} strokeWidth="17" />
        </>
      );
      break;
    }
    case "dresser":
      artwork = (
        <>
          {wood(12, 22, 976, 953, 28)}
          {rect(33, 51, 934, 688, paint("grain"), 15, "none")}
          {[765, 832, 899].map((y) => (
            <g key={y}>
              <path
                d={`M 40 ${y - 12} H 960`}
                stroke={edge}
                strokeOpacity=".5"
                strokeWidth="7"
              />
              {handle(375, y + 10, 250)}
            </g>
          ))}
        </>
      );
      break;
    case "nightstand":
      artwork = (
        <>
          {wood(20, 28, 960, 942, 48)}
          {rect(46, 734, 908, 206, paint("surface"), 20)}
          {handle(347, 835, 306)}
          {rect(553, 198, 276, 367, "#b7c4b4", 10, "#849581")}
          <path
            d="M 587 229 H 780 M 587 265 H 741"
            stroke="#f6f3e7"
            strokeWidth="7"
          />
          {circle(259, 332, 105, "#f4eee0", "#b5a78d")}
          {circle(259, 332, 56, paint("metal"), "#a39170")}
        </>
      );
      break;
    case "shelf":
      artwork = (
        <>
          {wood(12, 20, 976, 958, 16)}
          {rect(56, 73, 888, 806, tint(color, "#283a2f", 0.3), 3)}
          {[0, 1, 2].map((section) => (
            <g key={section}>
              {rect(73 + section * 292, 97, 255, 726, light, 2, "none")}
              {["#91a58b", "#d0b088", "#c8d0bf", "#6c8b81", "#ddd3b9"].map(
                (book, i) => (
                  <g key={i}>
                    {rect(
                      85 + section * 292 + i * 45,
                      238 + (i % 2) * 66,
                      35,
                      485 - (i % 2) * 66,
                      book,
                      4,
                      "#6c79615c",
                    )}
                    <path
                      d={`M ${96 + section * 292 + i * 45} 658 V 700`}
                      stroke="#ffffff"
                      strokeOpacity=".65"
                      strokeWidth="6"
                    />
                  </g>
                ),
              )}
            </g>
          ))}
          <path
            d="M 340 67 V 894 M 659 67 V 894 M 51 900 H 949"
            stroke={edge}
            strokeWidth="20"
          />
        </>
      );
      break;
    case "kitchen":
      artwork = (
        <>
          {wood(6, 24, 988, 952, 18)}
          {rect(13, 36, 974, 820, paint("ceramic"), 14, "#a4b0a4")}
          <path
            d="M 22 87 H 978 M 248 870 V 965 M 495 870 V 965 M 742 870 V 965"
            stroke="#b2b7a7"
            strokeWidth="7"
          />
          {rect(78, 167, 265, 561, paint("metal"), 22, "#8d9c93")}
          {rect(98, 204, 220, 483, paint("basin"), 28, "#97aaa5")}
          {circle(210, 440, 12, paint("metal"), "#788e86")}
          <path
            d="M 204 116 V 283 Q 204 359 234 351"
            fill="none"
            stroke="#b4c0b9"
            strokeWidth="15"
          />
          {rect(632, 137, 267, 630, "#333f3b", 18, "#6d7e74")}
          {burner(699, 306, 40)}
          {burner(831, 306, 35)}
          {burner(699, 593, 35)}
          {burner(831, 593, 40)}
          {rect(414, 258, 159, 379, "#cabb9c", 20, "#aa997c")}
          <path
            d="M 492 261 V 177"
            stroke="#ac9b7e"
            strokeWidth="18"
            strokeLinecap="round"
          />
          {[65, 312, 559, 806].map((x) => (
            <g key={x}>{handle(x, 915, 119)}</g>
          ))}
        </>
      );
      break;
    case "sink":
      artwork = (
        <>
          {rect(16, 32, 968, 930, "#2c43321a", 105, "none")}
          {rect(14, 18, 972, 938, paint("ceramic"), 105, "#aebbb3")}
          <ellipse
            cx="500"
            cy="545"
            rx="393"
            ry="322"
            fill={paint("basin")}
            stroke="#b3c4be"
            strokeWidth="14"
          />
          <ellipse
            cx="500"
            cy="542"
            rx="346"
            ry="273"
            fill="none"
            stroke="#ffffff"
            strokeOpacity=".66"
            strokeWidth="6"
          />
          {circle(500, 638, 31, paint("metal"), "#92a49a")}
          <path
            d="M 500 118 V 375 Q 500 428 550 414"
            fill="none"
            stroke="#90a29b"
            strokeWidth="33"
            strokeLinecap="round"
          />
          <path
            d="M 493 118 V 367"
            stroke="#ecf3ee"
            strokeWidth="12"
            strokeLinecap="round"
          />
          {circle(309, 131, 24, paint("metal"))}
          {circle(691, 131, 24, paint("metal"))}
        </>
      );
      break;
    case "bath":
      artwork = (
        <>
          {rect(13, 29, 974, 950, "#253b2c24", 180, "none")}
          {rect(11, 17, 978, 950, paint("ceramic"), 180, "#a9b8af")}
          {rect(67, 102, 866, 789, paint("basin"), 214, "#becdc6")}
          <rect
            x="104"
            y="149"
            width="792"
            height="683"
            rx="205"
            fill="none"
            stroke="#ffffff"
            strokeOpacity=".73"
            strokeWidth="13"
          />
          {circle(172, 500, 15, paint("metal"), "#93a49b")}
          <path
            d="M 50 430 H 150 M 48 397 V 463"
            stroke="#859c92"
            strokeWidth="21"
            strokeLinecap="round"
          />
          <path
            d="M 48 427 H 141"
            stroke="#f3f7f2"
            strokeWidth="7"
            strokeLinecap="round"
          />
          <path
            d="M 787 263 Q 869 509 787 750"
            fill="none"
            stroke="#bdd2cd"
            strokeOpacity=".46"
            strokeWidth="12"
          />
        </>
      );
      break;
    case "toilet":
      artwork = (
        <>
          {rect(174, 30, 652, 284, paint("ceramic"), 58, "#aab9b0")}
          <ellipse cx="500" cy="609" rx="355" ry="363" fill="#384b3824" />
          <ellipse
            cx="500"
            cy="589"
            rx="355"
            ry="363"
            fill={paint("ceramic")}
            stroke="#abbcb2"
            strokeWidth="10"
          />
          <ellipse
            cx="500"
            cy="590"
            rx="260"
            ry="285"
            fill={paint("basin")}
            stroke="#c8d6cd"
            strokeWidth="13"
          />
          <ellipse
            cx="500"
            cy="603"
            rx="190"
            ry="221"
            fill="#e7eeea"
            stroke="#fbfcf7"
            strokeWidth="16"
          />
          {rect(268, 274, 464, 43, "#e3e9df", 12, "#b7c5ba")}
          {circle(666, 164, 50, paint("metal"), "#a0aea1")}
          <path d="M 666 139 V 187" stroke="#85968a" strokeWidth="6" />
        </>
      );
      break;
    case "fridge":
      artwork = (
        <>
          {rect(31, 31, 938, 940, "#344b3321", 44, "none")}
          {rect(21, 17, 958, 944, paint("ceramic"), 42, "#96a89c")}
          {rect(42, 49, 916, 211, tint(color, "#f5f8f0", 0.84), 27, "#b5c2b7")}
          {rect(42, 276, 916, 591, paint("ceramic"), 20, "#b5c2b7")}
          <path
            d="M 72 889 H 928 M 82 914 H 918"
            stroke="#7e9284"
            strokeWidth="10"
          />
          {handle(739, 224, 141)}
          {handle(739, 338, 141)}
          {[108, 148, 188, 228, 268].map((x) => (
            <path
              key={x}
              d={`M ${x} 106 V 179`}
              stroke="#a2b2a5"
              strokeWidth="8"
            />
          ))}
        </>
      );
      break;
    case "washer":
      artwork = (
        <>
          {rect(17, 31, 966, 938, "#2a422a20", 45, "none")}
          {rect(17, 18, 966, 938, paint("ceramic"), 45, "#a2b3a8")}
          {circle(500, 442, 314, paint("metal"), "#879e95")}
          {circle(500, 442, 268, paint("glass"), "#dce5db")}
          {circle(500, 442, 215, "#3f53566b", "#90a7a24d")}
          <path
            d="M 333 265 Q 567 139 696 333"
            fill="none"
            stroke="#eef8f2"
            strokeOpacity=".52"
            strokeWidth="20"
            strokeLinecap="round"
          />
          <path
            d="M 381 487 Q 501 414 621 487 T 693 551"
            fill="none"
            stroke="#95b1ac"
            strokeOpacity=".48"
            strokeWidth="19"
          />
          {rect(43, 817, 914, 105, "#e3e9df", 20, "#abbcaf")}
          {rect(84, 848, 196, 32, "#a2b1a4", 8, "none")}
          {circle(846, 868, 36, paint("metal"))}
          {[640, 702, 764].map((x) => (
            <g key={x}>{circle(x, 868, 13, "#91a596", "none")}</g>
          ))}
        </>
      );
      break;
    case "stove":
      artwork = (
        <>
          {rect(17, 28, 966, 938, paint("metal"), 42, "#70857a")}
          {rect(49, 55, 902, 732, "#2c3836", 22, "#85988a")}
          {burner(287, 248, 135)}
          {burner(713, 248, 113)}
          {burner(287, 611, 113)}
          {burner(713, 611, 135)}
          <path
            d="M 103 91 H 897"
            stroke="#afbeb1"
            strokeOpacity=".26"
            strokeWidth="7"
          />
          {rect(47, 812, 906, 103, paint("metal"), 18, "#a4b0a3")}
          {[217, 407, 597, 787].map((x) => (
            <g key={x}>
              {circle(x, 864, 37, "#d9e0d5", "#7b8e80")}
              <path d={`M ${x} 836 V 858`} stroke="#60756a" strokeWidth="6" />
            </g>
          ))}
        </>
      );
      break;
    case "lamp":
      artwork = (
        <>
          {circle(508, 517, 410, "#31462f20", "none")}
          {circle(500, 500, 410, paint("linen"), "#b8ae92")}
          {circle(500, 500, 354, "#f6f1df", "#d0c8ad")}
          <g stroke="#d8cfb2" strokeWidth="7" opacity=".8">
            {Array.from({ length: 16 }, (_, i) => (
              <path
                key={i}
                d="M 500 155 V 262"
                transform={`rotate(${i * 22.5} 500 500)`}
              />
            ))}
          </g>
          {circle(500, 500, 192, paint("metal"), "#9e997d")}
          {circle(500, 500, 101, "#c4ac75", "#a38b5e")}
          {circle(478, 473, 21, "#fff4cd", "none")}
        </>
      );
      break;
    case "plant":
      artwork = (
        <>
          {circle(511, 537, 291, "#2d452931", "none")}
          {circle(500, 500, 282, "#b69b76", "#927d5e")}
          {circle(500, 500, 233, "#645f45", "#c2ad88")}
          {Array.from({ length: 9 }, (_, i) => (
            <g key={i} transform={`rotate(${i * 40 + 8} 500 500)`}>
              <path
                d="M 497 531 Q 344 281 468 42 Q 640 214 507 531 Z"
                fill={paint("leaf")}
                stroke="#416c48"
                strokeWidth="5"
              />
              <path
                d="M 501 492 Q 493 304 468 83"
                fill="none"
                stroke="#b0cb8e"
                strokeOpacity=".54"
                strokeWidth="6"
              />
              <path
                d="M 490 258 l -48 -38 M 493 325 l 48 -41"
                stroke="#b7cf93"
                strokeOpacity=".3"
                strokeWidth="5"
              />
            </g>
          ))}
          {circle(498, 508, 49, "#b7c987", "#729357")}
        </>
      );
      break;
    case "rug":
      artwork = (
        <>
          {rect(19, 21, 962, 958, tint(color, "#eee9df", 0.25), 13, "#a8997d")}
          <rect x="44" y="43" width="912" height="914" fill={paint("weave")} />
          <rect
            x="93"
            y="98"
            width="814"
            height="804"
            rx="5"
            fill="none"
            stroke={edge}
            strokeOpacity=".25"
            strokeWidth="13"
          />
          <rect
            x="115"
            y="121"
            width="770"
            height="758"
            rx="4"
            fill="none"
            stroke="#fff6e7"
            strokeOpacity=".5"
            strokeWidth="7"
          />
          <rect
            x="135"
            y="141"
            width="730"
            height="718"
            fill={paint("diamonds")}
          />
          <g stroke="#b8a98d" strokeWidth="6" opacity=".85">
            {Array.from({ length: 35 }, (_, i) => (
              <path
                key={i}
                d={`M ${43 + i * 27} 5 V 35 M ${43 + i * 27} 965 V 995`}
              />
            ))}
          </g>
        </>
      );
      break;
    default:
      artwork = (
        <>
          {wood(8, 16, 984, 971, 26)}
          <rect
            x="44"
            y="57"
            width="912"
            height="861"
            rx="12"
            fill="none"
            stroke={light}
            strokeOpacity=".7"
            strokeWidth="8"
          />
        </>
      );
  }
  return (
    <g
      data-furniture-artwork={type}
      strokeLinejoin="round"
      strokeLinecap="round"
    >
      <defs>
        <linearGradient id={`${id}-surface`} x1="0" y1="0" x2=".28" y2="1">
          <stop stopColor={light} />
          <stop offset=".5" stopColor={color} />
          <stop offset="1" stopColor={dark} />
        </linearGradient>
        <linearGradient id={`${id}-linen`} x2=".3" y2="1">
          <stop stopColor="#fffdf3" />
          <stop offset=".6" stopColor="#eeeee3" />
          <stop offset="1" stopColor="#d8dbcc" />
        </linearGradient>
        <linearGradient id={`${id}-ceramic`} x2=".3" y2="1">
          <stop stopColor={tint(enamel, "#ffffff", 0.65)} />
          <stop offset=".6" stopColor={enamel} />
          <stop offset="1" stopColor={tint(enamel, "#aabaaa", 0.28)} />
        </linearGradient>
        <radialGradient id={`${id}-basin`} cx=".5" cy=".45" r=".65">
          <stop stopColor="#f2f7f1" />
          <stop offset=".65" stopColor="#dfeae3" />
          <stop offset="1" stopColor="#a9c0b7" />
        </radialGradient>
        <linearGradient id={`${id}-metal`} x2=".8" y2="1">
          <stop stopColor="#edf3eb" />
          <stop offset=".35" stopColor="#abbeb2" />
          <stop offset=".52" stopColor="#e6eee5" />
          <stop offset="1" stopColor="#8caa9b" />
        </linearGradient>
        <linearGradient id={`${id}-glass`} x2=".6" y2="1">
          <stop stopColor="#b6d1ca" />
          <stop offset=".4" stopColor="#6e9291" />
          <stop offset="1" stopColor="#344e53" />
        </linearGradient>
        <linearGradient id={`${id}-leaf`} x2="1" y2=".6">
          <stop stopColor="#a8bd86" />
          <stop offset=".45" stopColor={tint(color, "#587a46", 0.25)} />
          <stop offset="1" stopColor="#365f3e" />
        </linearGradient>
        <pattern
          id={`${id}-grain`}
          width="160"
          height="240"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 0 26 Q 57 11 160 31 M 0 78 Q 82 57 160 88 M 0 163 Q 56 143 160 160 M 0 207 Q 101 229 160 204"
            fill="none"
            stroke={edge}
            strokeOpacity=".09"
            strokeWidth="4"
          />
          <path
            d="M 0 127 Q 96 107 160 121"
            fill="none"
            stroke="#ffffff"
            strokeOpacity=".17"
            strokeWidth="5"
          />
        </pattern>
        <pattern
          id={`${id}-weave`}
          width="17"
          height="17"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 0 4 H 17 M 4 0 V 17"
            stroke="#ffffff"
            strokeOpacity=".14"
            strokeWidth="3"
          />
          <path
            d="M 0 12 H 17 M 12 0 V 17"
            stroke={edge}
            strokeOpacity=".05"
            strokeWidth="2"
          />
        </pattern>
        <pattern
          id={`${id}-diamonds`}
          width="170"
          height="200"
          patternUnits="userSpaceOnUse"
        >
          <path
            d="M 85 20 L 140 100 85 180 30 100 Z"
            fill="none"
            stroke={edge}
            strokeOpacity=".18"
            strokeWidth="8"
          />
          <path
            d="M 85 70 L 108 100 85 130 62 100 Z"
            fill="#fff7e6"
            fillOpacity=".5"
          />
        </pattern>
      </defs>
      {artwork}
    </g>
  );
});
