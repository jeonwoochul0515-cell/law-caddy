# Design System: The Private Member’s Atelier

이 디자인 시스템은 초고액 자산가를 위한 법률 컨시어지 서비스로서, 하이엔드 골프 클럽의 정갈한 여유와 전통 법률 사무소의 권위 있는 신뢰감을 결합한 디지털 경험을 지향합니다. 우리는 단순히 정보를 전달하는 것을 넘어, 사용자가 마치 배타적인 멤버십 클럽의 라운지에 들어선 듯한 '환대'와 '심리적 안정감'을 느끼게 하는 것을 목표로 합니다.

---

## 1. Creative North Star: "The Digital Curator" (디지털 큐레이터)

이 시스템의 핵심 원칙은 **'절제된 우아함'**입니다. 일반적인 그리드 시스템의 경직성을 탈피하여, 마치 고급 매거진의 레이아웃처럼 대담한 여백(Whitespace)과 비대칭적 요소 배치를 통해 시각적 숨통을 틔워줍니다.

*   **배타적 권위(Authoritative):** 깊은 브리티시 레이싱 그린과 샴페인 골드의 대비로 흔들리지 않는 신뢰를 표현합니다.
*   **세밀한 배려(Meticulous):** 아주 미세한 텍스처와 톤온톤(Tone-on-tone)의 레이어링을 통해 보이지 않는 곳까지 신경 쓴 디테일을 제공합니다.
*   **비정형의 미학:** 모든 요소를 박스 안에 가두지 않습니다. 이미지는 텍스트와 우아하게 중첩되며, 요소들 사이의 간격은 넓고 의도적입니다.

---

## 2. Colors: The Heritage Palette

컬러는 브랜드의 목소리입니다. 우리는 표준적인 원색을 배제하고, 시간의 흐름이 느껴지는 깊이 있는 색조를 사용합니다.

### 핵심 컬러 원칙
*   **The "No-Line" Rule (선 배제의 원칙):** 구획을 나누기 위해 `1px` 실선을 사용하는 것을 금지합니다. 섹션의 구분은 `surface-container-low`와 `surface` 배경색의 미세한 명도 차이, 혹은 부드러운 톤의 변화로만 구현합니다.
*   **Surface Hierarchy & Nesting:** 레이아웃을 평면적인 격자가 아닌, 얇은 수입지나 반투명한 유리가 겹쳐진 '물리적 층(Layer)'으로 취급합니다. `surface-container-lowest` 카드를 `surface-container-low` 섹션 위에 배치하여 자연스러운 깊이감을 형성하십시오.
*   **The "Glass & Gradient" Rule:** 메인 CTA나 히어로 섹션에는 `primary`(#01261f)에서 `primary_container`(#1a3c34)로 흐르는 아주 미세한 그라디언트를 적용하여 평면성을 극복하고 고급스러운 입체감을 부여합니다.

### 주요 토큰 활용
- **Primary (#01261f):** 신뢰의 상징. 깊은 숲과 같은 그린.
- **Secondary (#735c00):** 샴페인 골드. 성공의 흔적을 나타내는 강조색.
- **Surface (#faf9f5):** 오프 화이트. 눈의 피로를 줄이고 우아함을 더하는 기본 배경.

---

## 3. Typography: Editorial Sophistication

타이포그래피는 정보 전달 이상의 '어조(Tone of Voice)'를 결정합니다.

*   **Display & Headline (Noto Serif KR / Playfair Display):** 장식적이고 권위 있는 세리프체를 사용하여 신뢰감을 형성합니다. 큰 타이포그래피 스케일(`display-lg`: 3.5rem)을 활용해 여백 속에서 강렬한 시각적 중심점(Anchor) 역할을 수행하게 합니다.
*   **Body & Label (Manrope / Noto Sans KR):** 본문은 가독성이 뛰어난 현대적인 산세리프를 사용합니다. `letter-spacing`을 미세하게 조정하여 현대적이고 정돈된 인상을 줍니다.
*   **Hierarchy Strategy:** 헤드라인은 `on_surface` 컬러를 사용하고, 부연 설명이나 레이블은 `on_surface_variant`를 사용하여 시각적 위계를 명확히 분리합니다.

---

## 4. Elevation & Depth: Tonal Layering

이 디자인 시스템에서 '깊이'는 그림자가 아니라 '조도'와 '재질'의 차이로 완성됩니다.

*   **The Layering Principle:** 그림자(Shadow) 대신 토큰의 위계를 사용하십시오. `surface_container_highest` 위에 놓인 `surface_container_lowest` 요소는 별도의 효과 없이도 시각적으로 부상합니다.
*   **Ambient Shadows:** 부득이하게 부유(Floating) 효과가 필요할 경우, 그림자는 매우 넓게 퍼지고(Blur 40px 이상), 불투명도는 극도로 낮게(4-8%) 설정합니다. 그림자 색상은 단순 블랙이 아닌 `on_surface` 컬러를 미세하게 섞어 주변 환경과 조화되도록 합니다.
*   **Glassmorphism:** 플로팅 메뉴나 모달에는 `surface` 컬러에 80% 불투명도를 적용하고 `backdrop-blur` 효과를 주어, 배경의 색감이 은은하게 비쳐 나오도록 합니다. 이는 공간이 단절되지 않고 연결되어 있다는 느낌을 줍니다.

---

## 5. Components: The Bespoke Elements

### Buttons
*   **Primary:** `primary` 배경에 `secondary`(샴페인 골드) 텍스트 혹은 화이트. 모서리는 `md`(0.375rem)로 절제된 곡률을 적용합니다.
*   **Tertiary:** 배경 없이 텍스트로만 구성하되, 하단에 `secondary` 컬러의 매우 얇은(0.5px) `outline-variant` 선을 배치하여 우아함을 더합니다.

### Cards & Lists
*   **Anti-Divider Rule:** 리스트 아이템 사이에 구분선을 넣지 마십시오. 대신 `spacing-8`(2.75rem) 이상의 수직 여백을 활용하거나, 호버 시 `surface_container_low`로 배경색이 부드럽게 변하는 인터랙션을 사용합니다.
*   **Card Style:** 테두리(Border) 대신 `surface_variant` 컬러의 'Ghost Border'(불투명도 15%)를 적용하여 경계만 미세하게 인식되도록 합니다.

### Input Fields
*   **Focus State:** 입력 필드 포커스 시 테두리가 두꺼워지는 대신, 배경색이 `surface_container_high`로 깊어지며 `primary` 컬러의 얇은 하단 라인만 나타나도록 설계합니다.

### Special Component: The Concierge Badge
*   골프 클럽의 플래그스틱(Flagstick) 모티프를 활용한 수직 바(Vertical Bar) 형태의 인디케이터를 섹션 좌측에 배치하여 현재 위치를 시각적으로 가이드합니다.

---

## 6. Do's and Don'ts

### Do
*   **의도적인 비대칭:** 텍스트는 좌측 정렬, 이미지는 우측 하단에 걸치게 배치하는 등 잡지 레이아웃 같은 구성을 지향하세요.
*   **여백의 미:** '너무 비어 보이지 않나?'라는 생각이 들 때 한 번 더 여백을 추가하세요. 여백은 낭비가 아니라 '여유'입니다.
*   **미세한 텍스처:** 배경에 아주 연한 종이 질감이나 잔디의 유기적인 패턴을 오버레이(Opacity 3% 이하)하여 디지털의 차가움을 상쇄하세요.

### Don't
*   **고대비의 선 사용:** 검정색(#000000) 1px 선은 이 시스템의 우아함을 파괴합니다.
*   **과도한 애니메이션:** 팝업이나 슬라이드는 극도로 부드럽고 느리게(Ease-out, 400ms 이상) 움직여야 합니다. 경박한 움직임은 권위를 해칩니다.
*   **복잡한 그리드:** 한 화면에 너무 많은 정보를 구겨 넣지 마십시오. 정보가 많다면 스크롤을 길게 가져가더라도 각 요소에 충분한 호흡을 부여하세요.

---

이 디자인 시스템은 법률적 엄숙함과 골프의 여유로움을 잇는 가교입니다. 모든 픽셀에서 사용자가 **'특별 대우를 받고 있다'**는 느낌을 받을 수 있도록 세심하게 설계하십시오.