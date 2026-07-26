#!/bin/bash
# 배포 후 API 헬스체크
#
# 검사 대상 URL 결정 순서:
#   1) 첫 번째 인자         — bash scripts/post-deploy-check.sh https://abc123.law-caddy.pages.dev
#   2) DEPLOY_URL 환경변수
#   3) 현재 git 브랜치에서 추론
#        - 프로덕션 브랜치(main) → https://law-caddy.pages.dev
#        - 그 외 브랜치          → https://<브랜치슬러그>.law-caddy.pages.dev
#
# 예전에는 PROD_URL을 하드코딩했다. 그 탓에 브랜치에서 배포하면 방금 올린 코드가 아니라
# 구버전 프로덕션을 검사하고 "모든 헬스체크 통과"를 띄웠다. 실제로 한 번 속았다.

PROJECT="law-caddy"
PRODUCTION_BRANCH="main"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

# ── 검사 대상 URL 결정 ──
TARGET="$1"
[ -z "$TARGET" ] && TARGET="$DEPLOY_URL"

if [ -z "$TARGET" ]; then
  BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
  if [ -z "$BRANCH" ] || [ "$BRANCH" = "$PRODUCTION_BRANCH" ]; then
    TARGET="https://${PROJECT}.pages.dev"
    SOURCE="프로덕션 (브랜치: ${BRANCH:-불명})"
  else
    # Cloudflare Pages 별칭 규칙: 영숫자가 아닌 문자는 -로, 소문자로
    SLUG=$(echo "$BRANCH" | tr '[:upper:]' '[:lower:]' | sed 's/[^a-z0-9]/-/g')
    TARGET="https://${SLUG}.${PROJECT}.pages.dev"
    SOURCE="프리뷰 (브랜치: $BRANCH)"
  fi
else
  SOURCE="지정됨"
fi

echo ""
echo "========================================="
echo "  LAW-CADDY 배포 후 헬스체크"
echo "========================================="
echo -e "  대상: ${YELLOW}${TARGET}${NC}"
echo "  경로: $SOURCE"
echo ""

# ── 1. 기본 헬스체크 (배포 직후 전파 지연을 감안해 재시도) ──
echo -n "[1/4] 기본 헬스체크... "
HEALTH=""
for i in 1 2 3; do
  HEALTH=$(curl -s --max-time 10 "$TARGET/api/health" 2>/dev/null)
  echo "$HEALTH" | grep -q '"status":"ok"' && break
  [ $i -lt 3 ] && sleep 3
done

if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC}"
  echo "  응답: $HEALTH"
  echo -e "${RED}>>> 기본 서비스에 문제가 있습니다! <<<${NC}"
  exit 1
fi

# ── 2. Claude API 키 설정 ──
echo -n "[2/4] Claude API 키 설정... "
if echo "$HEALTH" | grep -q '"claudeConfigured":true'; then
  KEY_PREFIX=$(echo "$HEALTH" | grep -o '"keyPrefix":"[^"]*"' | cut -d'"' -f4)
  echo -e "${GREEN}OK${NC} ($KEY_PREFIX)"
else
  echo -e "${RED}NOT SET${NC}"
  echo -e "${RED}>>> ANTHROPIC_API_KEY가 설정되지 않았습니다! <<<${NC}"
  exit 1
fi

# ── 3. Claude API 실제 호출 ──
echo -n "[3/4] Claude API 실제 호출... "
CLAUDE_TEST=$(curl -s --max-time 30 "$TARGET/api/health?test=claude" 2>/dev/null)
if echo "$CLAUDE_TEST" | grep -q '"anthropicTest":"OK"'; then
  echo -e "${GREEN}OK${NC}"
else
  ERROR=$(echo "$CLAUDE_TEST" | grep -o '"anthropicTest":"[^"]*"' | cut -d'"' -f4)
  echo -e "${RED}FAIL ($ERROR)${NC}"
  echo -e "${RED}>>> Claude API 호출에 실패했습니다! 키를 확인하세요. <<<${NC}"
  exit 1
fi

# ── 4. Firebase 서비스 계정 (결제 승인·전자서명이 여기에 걸려 있다) ──
#
# /api/signing은 서비스 계정으로 Firestore를 조회한다. 없는 토큰이면 404가 정상.
# 500이 뜨면 FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY 미설정이고,
# 그 경우 payment/confirm도 같은 함수를 쓰므로 **결제가 조용히 실패한다**
# (Toss 승인은 성공하고 plan 갱신에서 터진다 = 돈은 나가고 요금제는 안 올라감).
# 2026-07-26에 실제로 이 상태였다.
echo -n "[4/4] Firebase 서비스 계정... "
SIGN_CODE=$(curl -s -o /tmp/lc_sign_check.txt -w "%{http_code}" --max-time 15 \
  "$TARGET/api/signing/healthcheck-nonexistent-token" 2>/dev/null)
SIGN_BODY=$(cat /tmp/lc_sign_check.txt 2>/dev/null)
rm -f /tmp/lc_sign_check.txt

if [ "$SIGN_CODE" = "404" ]; then
  echo -e "${GREEN}OK${NC}"
elif echo "$SIGN_BODY" | grep -q "서비스 계정 환경변수"; then
  echo -e "${RED}NOT SET${NC}"
  echo -e "${RED}>>> FIREBASE_CLIENT_EMAIL / FIREBASE_PRIVATE_KEY가 없습니다! <<<${NC}"
  echo -e "${RED}>>> 이 상태에서는 결제 승인이 실패합니다 (카드는 결제되고 요금제는 미부여). <<<${NC}"
  echo "  등록: cat key.txt | npx wrangler pages secret put FIREBASE_PRIVATE_KEY --project-name $PROJECT"
  exit 1
elif [ "$SIGN_CODE" = "401" ]; then
  echo -e "${YELLOW}SKIP${NC} (구버전 배포 — /api/signing이 공개 경로에 없음)"
else
  echo -e "${RED}FAIL (HTTP $SIGN_CODE)${NC}"
  echo "  응답: $SIGN_BODY"
  exit 1
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  모든 헬스체크 통과! 배포 정상 완료${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
