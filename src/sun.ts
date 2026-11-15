// ---------- 太阳位置:NOAA 算法 ----------
// 输入纬度/经度/时区/日期/当地时间,输出方位角(北0°顺时针)与高度角。
// 精度约 0.01°,对于米级房间,光斑位置误差远小于 1 厘米。

export interface SunPosition {
  /** 方位角,度,北0 东90 南180 西270 */
  azimuth: number;
  /** 高度角,度,地平线为 0 */
  elevation: number;
  /** 是否在地平线以上 */
  up: boolean;
}

const D2R = Math.PI / 180;

export function sunPosition(
  lat: number,
  lon: number,
  timezone: number,
  date: string, // 'YYYY-MM-DD'(当地日期)
  timeMinutes: number, // 当地时间(分钟)
): SunPosition {
  const [y, m, d] = date.split('-').map((s) => parseInt(s, 10));
  // 当地日期 + 当地时间 -> UTC 时刻(小时)
  const utcHours = timeMinutes / 60 - timezone;
  const jd = julianDay(y, m, d, utcHours);
  const T = (jd - 2451545.0) / 36525;

  // 几何平均黄经 / 平近点角 / 偏心率
  const L0 = norm360(280.46646 + T * (36000.76983 + 0.0003032 * T));
  const M = norm360(357.52911 + T * (35999.05029 - 0.0001537 * T));
  const e = 0.016708634 - T * (0.000042037 + 0.0000001267 * T);

  const Mrad = M * D2R;
  const C =
    Math.sin(Mrad) * (1.914602 - T * (0.004817 + 0.000014 * T)) +
    Math.sin(2 * Mrad) * (0.019993 - 0.000101 * T) +
    Math.sin(3 * Mrad) * 0.000289;
  const trueLong = L0 + C;
  const omega = 125.04 - 1934.136 * T;
  const lambda = (trueLong - 0.00569 - 0.00478 * Math.sin(omega * D2R)) * D2R;

  const eps0 =
    23 + (26 + (21.448 - T * (46.815 + T * (0.00059 - T * 0.001813))) / 60) / 60;
  const eps = (eps0 + 0.00256 * Math.cos(omega * D2R)) * D2R;

  const decl = Math.asin(Math.sin(eps) * Math.sin(lambda));

  // 均时差(分钟)
  const y2 = Math.tan(eps / 2) ** 2;
  const L0r = L0 * D2R;
  const eqTime =
    4 *
    (y2 * Math.sin(2 * L0r) -
      2 * e * Math.sin(Mrad) +
      4 * e * y2 * Math.sin(Mrad) * Math.cos(2 * L0r) -
      0.5 * y2 * y2 * Math.sin(4 * L0r) -
      1.25 * e * e * Math.sin(2 * Mrad)) /
    D2R;

  // 真太阳时 -> 时角
  const utcMinutes = timeMinutes - timezone * 60;
  const tst = ((utcMinutes + eqTime + 4 * lon) % 1440 + 1440) % 1440;
  const ha = (tst / 4 - 180) * D2R;

  const latR = lat * D2R;
  const cosEl =
    Math.sin(latR) * Math.sin(decl) + Math.cos(latR) * Math.cos(decl) * Math.cos(ha);
  const elevation = Math.asin(Math.min(1, Math.max(-1, cosEl)));
  // 方位角:北 0°,顺时针
  let az =
    Math.atan2(
      Math.sin(ha),
      Math.cos(ha) * Math.sin(latR) - Math.tan(decl) * Math.cos(latR),
    ) + Math.PI;
  az = norm360(az / D2R);

  return { azimuth: az, elevation: elevation / D2R, up: elevation > 0 };
}

/**
 * 太阳方向单位向量(指向太阳),窗户局部世界系:
 * x 向右(从室内看窗),y 向上,z 指向室内(窗外为 -z)。
 * 窗户外法线方位角 facingAzimuth(度)。
 */
export function sunDirectionLocal(azimuth: number, elevation: number, facingAzimuth: number): [number, number, number] {
  const rel = (azimuth - facingAzimuth) * D2R;
  const el = elevation * D2R;
  const ce = Math.cos(el);
  // rel = 0:太阳在窗外正前方 -> z 分量为负
  return [ce * Math.sin(rel), Math.sin(el), -ce * Math.cos(rel)];
}

function norm360(x: number): number {
  return ((x % 360) + 360) % 360;
}

function julianDay(y: number, m: number, d: number, utcHours: number): number {
  // Meeus 公式
  let yy = y;
  let mm = m;
  if (mm <= 2) {
    yy -= 1;
    mm += 12;
  }
  const A = Math.floor(yy / 100);
  const B = 2 - A + Math.floor(A / 4);
  return (
    Math.floor(365.25 * (yy + 4716)) +
    Math.floor(30.6001 * (mm + 1)) +
    d +
    utcHours / 24 +
    B -
    1524.5
  );
}
