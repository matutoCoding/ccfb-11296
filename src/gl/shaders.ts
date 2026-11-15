// ---------- GLSL 着色器(WebGL2 / GLSL ES 3.00) ----------

export const ROOM_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec3 aColor;
uniform mat4 uVP;
out vec3 vPos;
out vec3 vNormal;
out vec3 vColor;
void main() {
  vPos = aPos;
  vNormal = aNormal;
  vColor = aColor;
  gl_Position = uVP * vec4(aPos, 1.0);
}
`;

// 房间着色:对每个表面点,沿太阳方向反推与窗平面(z=0)的交点,
// 交点落在窗洞内则采样彩绘玻璃纹理得到透射光色。
// 肌理玻璃:用法线贴图偏折采样位置(折射扭曲),并由法线场散度估计焦散增益。
export const ROOM_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec3 vNormal;
in vec3 vColor;
out vec4 frag;

uniform vec3 uSunDir;        // 指向太阳的单位向量(窗户局部坐标系)
uniform float uSunOn;        // 太阳在地平线上且位于窗外一侧
uniform vec3 uSunColor;
uniform vec4 uWindowRect;    // 窗洞:x0,y0,x1,y1(世界坐标,z=0 平面)
uniform sampler2D uPatternColor; // rgb=玻璃颜色 a=透光率
uniform sampler2D uPatternType;  // r=肌理类型/铅条标记 g=肌理尺度 b=随机相位
uniform sampler2D uNormalRipple;
uniform sampler2D uNormalBubbles;
uniform float uRefractStrength;
uniform float uCausticGain;
uniform float uSunSoftness;  // 太阳角半径(弧度),用于柔化光斑边缘
uniform float uAmbient;
uniform float uOutdoor;      // 1=室外表面(直射阳光) 0=室内表面(只接收透窗光)

vec3 kindNormal(int kind, vec2 uvn) {
  if (kind == 1) return texture(uNormalRipple, uvn).xyz * 2.0 - 1.0;
  if (kind == 2) return texture(uNormalBubbles, uvn).xyz * 2.0 - 1.0;
  return vec3(0.0, 0.0, 1.0);
}

vec3 sampleGlass(vec2 uv, int kind, float tscale, vec2 phase) {
  vec2 uvn = uv * tscale + phase;
  vec3 n = kindNormal(kind, uvn);
  // 折射:光线穿过起伏的玻璃表面发生偏折,等效为采样位置偏移
  vec2 uv2 = clamp(uv - n.xy * uRefractStrength, 0.0, 1.0);
  vec4 c = texture(uPatternColor, uv2);
  // 焦散:法线场的散度决定光线汇聚/发散
  vec2 e = vec2(1.5 / 512.0, 0.0);
  float dndx = kindNormal(kind, uvn + e.xy).x - kindNormal(kind, uvn - e.xy).x;
  float dndy = kindNormal(kind, uvn + e.yx).y - kindNormal(kind, uvn - e.yx).y;
  float div = (dndx + dndy) * tscale * uRefractStrength;
  float gain = clamp(1.0 / (1.0 + uCausticGain * div * 25.0), 0.3, 2.5);
  return c.rgb * c.a * gain;
}

void main() {
  vec3 N = normalize(vNormal);
  vec3 light = vec3(uAmbient);
  if (uSunOn > 0.5) {
    if (uOutdoor > 0.5) {
      // 室外:朗伯直射
      light += uSunColor * max(dot(N, uSunDir), 0.0);
    } else if (uSunDir.z < -1e-5 && vPos.z > 0.0) {
      // 室内:反推光线与窗平面的交点
      float t = -vPos.z / uSunDir.z;
      vec3 Q = vPos + t * uSunDir;
      if (Q.x > uWindowRect.x && Q.x < uWindowRect.z &&
          Q.y > uWindowRect.y && Q.y < uWindowRect.w) {
        vec2 rectSize = uWindowRect.zw - uWindowRect.xy;
        vec2 uv = (Q.xy - uWindowRect.xy) / rectSize;
        vec4 tinfo = texture(uPatternType, uv);
        if (tinfo.r < 0.9) { // 铅条不透光
          int kind = int(tinfo.r * 255.0 + 0.5);
          float tscale = tinfo.g * 32.0;
          vec2 phase = vec2(tinfo.b, fract(tinfo.b * 7.31));
          // 太阳角半径 -> 窗面处的偏移幅度,4 次抖动采样柔化边缘
          float jit = t * uSunSoftness;
          vec2 poisson[4] = vec2[](
            vec2(0.0, 0.0), vec2(0.75, 0.4), vec2(-0.6, 0.65), vec2(0.1, -0.85));
          vec3 acc = vec3(0.0);
          for (int i = 0; i < 4; i++) {
            vec2 uvj = clamp(uv + poisson[i] * jit / rectSize, 0.0, 1.0);
            acc += sampleGlass(uvj, kind, tscale, phase);
          }
          light += uSunColor * acc * 0.25;
        }
      }
    }
  }
  vec3 col = vColor * light;
  col = col / (1.0 + col); // 简单色调映射
  frag = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;

export const GLASS_VS = `#version 300 es
layout(location=0) in vec3 aPos;
layout(location=1) in vec2 aUv;
uniform mat4 uVP;
out vec3 vPos;
out vec2 vUv;
void main() {
  vPos = aPos;
  vUv = aUv;
  gl_Position = uVP * vec4(aPos, 1.0);
}
`;

// 玻璃本体:室内看逆光透亮,室外看偏暗并反射天空
export const GLASS_FS = `#version 300 es
precision highp float;
in vec3 vPos;
in vec2 vUv;
out vec4 frag;

uniform sampler2D uPatternColor;
uniform vec3 uEye;
uniform vec3 uSunDir;
uniform float uSunOn;
uniform vec3 uSunColor;
uniform float uOutdoorView; // 1=相机在室外

void main() {
  vec4 g = texture(uPatternColor, vUv);
  vec3 V = normalize(uEye - vPos);
  vec3 N = vec3(0.0, 0.0, uOutdoorView > 0.5 ? -1.0 : 1.0);
  vec3 R = reflect(-V, N);
  // 简易天空渐变
  vec3 sky = mix(vec3(0.62, 0.68, 0.75), vec3(0.22, 0.42, 0.78), clamp(R.y, 0.0, 1.0));
  sky = mix(sky, vec3(0.9, 0.85, 0.72), pow(clamp(1.0 - abs(R.y), 0.0, 1.0), 3.0) * 0.35);
  float fres = 0.08 + 0.6 * pow(1.0 - max(dot(V, N), 0.0), 3.0);
  float glare = uSunOn * pow(max(dot(R, uSunDir), 0.0), 350.0) * 4.0;
  // 透射亮度:室内看有背光(太阳直射时更亮),室外看很暗
  float backlit = uOutdoorView > 0.5
    ? 0.08
    : 0.35 + uSunOn * max(-uSunDir.z, 0.0) * 1.2;
  vec3 col = g.rgb * backlit
    + sky * fres * (uOutdoorView > 0.5 ? 1.0 : 0.2)
    + uSunColor * glare * fres;
  col = col / (1.0 + col);
  frag = vec4(pow(col, vec3(1.0 / 2.2)), 1.0);
}
`;
