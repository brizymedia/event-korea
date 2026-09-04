# 이벤트 코리아 — www.event-korea.co.kr

이벤트인을 위한 포털. 단일 `index.html`, 서버 없음. GitHub Pages 로 뜬다.

실시간 판(입찰·축제)은 `haengsa-board` 가 매일 만드는
`https://brizymedia.github.io/haengsa-board/data/events.json` 을 브라우저가 직접 읽는다.
그 파일이 죽으면 페이지 안의 「비상용」 몇 건을 보여준다.

## 도메인 연결 (호스팅케이알(다우) DNS 관리에서 한 번)

| 종류 | 호스트 | 값 |
|---|---|---|
| A | @ | 185.199.108.153 |
| A | @ | 185.199.109.153 |
| A | @ | 185.199.110.153 |
| A | @ | 185.199.111.153 |
| CNAME | www | brizymedia.github.io. |

넣고 10분~몇 시간 뒤 GitHub 저장소 Settings → Pages 에서 「Enforce HTTPS」 가 켜지면 끝.
