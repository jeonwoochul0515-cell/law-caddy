#!/bin/bash
# 배포 후 API 헬스체크 스크립트
# deploy 완료 후 자동 실행되어 모든 API 상태를 확인합니다.

PROD_URL="https://law-caddy.pages.dev"
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo ""
echo "========================================="
echo "  LAW-CADDY 배포 후 헬스체크"
echo "========================================="
echo ""

# 1. 기본 헬스체크
echo -n "[1/3] 기본 헬스체크... "
HEALTH=$(curl -s --max-time 10 "$PROD_URL/api/health" 2>/dev/null)
if echo "$HEALTH" | grep -q '"status":"ok"'; then
  echo -e "${GREEN}OK${NC}"
else
  echo -e "${RED}FAIL${NC}"
  echo "  응답: $HEALTH"
  echo -e "${RED}>>> 기본 서비스에 문제가 있습니다! <<<${NC}"
  exit 1
fi

# 2. Claude API 키 설정 확인
echo -n "[2/3] Claude API 키 설정... "
if echo "$HEALTH" | grep -q '"claudeConfigured":true'; then
  KEY_PREFIX=$(echo "$HEALTH" | grep -o '"keyPrefix":"[^"]*"' | cut -d'"' -f4)
  echo -e "${GREEN}OK${NC} ($KEY_PREFIX)"
else
  echo -e "${RED}NOT SET${NC}"
  echo -e "${RED}>>> ANTHROPIC_API_KEY가 설정되지 않았습니다! <<<${NC}"
  exit 1
fi

# 3. Claude API 실제 호출 테스트
echo -n "[3/3] Claude API 실제 호출... "
CLAUDE_TEST=$(curl -s --max-time 30 "$PROD_URL/api/health?test=claude" 2>/dev/null)
if echo "$CLAUDE_TEST" | grep -q '"anthropicTest":"OK"'; then
  echo -e "${GREEN}OK${NC}"
else
  ERROR=$(echo "$CLAUDE_TEST" | grep -o '"anthropicTest":"[^"]*"' | cut -d'"' -f4)
  echo -e "${RED}FAIL ($ERROR)${NC}"
  echo -e "${RED}>>> Claude API 호출에 실패했습니다! 키를 확인하세요. <<<${NC}"
  exit 1
fi

echo ""
echo -e "${GREEN}=========================================${NC}"
echo -e "${GREEN}  모든 헬스체크 통과! 배포 정상 완료${NC}"
echo -e "${GREEN}=========================================${NC}"
echo ""
