# **옵시디언(Obsidian): 로컬 지향적 네트워크 사고를 위한 차세대 지식 관리 시스템의 건축학적 분석과 디자인 설계 연구**

디지털 정보의 폭발적인 증가와 개인의 인지적 한계가 교차하는 현대 사회에서, 정보의 단순한 저장을 넘어 '사고의 확장'을 지원하는 도구에 대한 요구가 그 어느 때보다 높다. 옵시디언(Obsidian)은 이러한 시대적 요구에 부응하여 등장한 '제2의 뇌(Second Brain)' 구축 도구로서, 데이터 주권과 네트워크화된 사고를 핵심 가치로 삼고 있다.1 본 보고서는 옵시디언의 설계 철학부터 기능적 명세, 인터페이스 디자인, 그리고 실제 전문적인 워크플로우에서의 적용 방식에 이르기까지 그 전모를 심층적으로 분석한다.

## **제1장. 설계 철학과 데이터 아키텍처: 소유권과 영속성**

옵시디언의 가장 근본적인 토대는 '앱보다 파일(File over App)'이라는 철학에 있다. 이는 특정 소프트웨어의 기능이나 서비스의 존속 여부에 사용자의 데이터가 종속되어서는 안 된다는 디지털 보존주의적 관점을 반영한다.1 옵시디언은 클라우드 기반의 데이터베이스를 사용하는 대신, 사용자의 로컬 드라이브에 일반 텍스트 형태의 마크다운(.md) 파일로 정보를 저장한다.1

이러한 로컬 우선(Local-first) 접근 방식은 데이터에 대한 완전한 통제권을 사용자에게 부여하며, 인터넷 연결 없이도 모든 기능을 수행할 수 있는 오프라인 환경을 보장한다.2 마크다운 형식의 채택은 단순한 포맷팅 편의성을 넘어, 향후 수십 년이 지난 뒤에도 범용적인 텍스트 편집기만 있다면 사용자의 기록을 완벽하게 복원할 수 있다는 미래 보장성(Future-proof)을 의미한다.3

디자인 측면에서 옵시디언은 사용자의 고유한 사고 방식을 존중하기 위해 극도로 높은 유연성을 제공한다. "당신의 마음은 고유하다(Your mind is unique)"는 전제하에, 도구가 사용자의 사고 과정을 규정하는 것이 아니라 사용자가 자신의 사고 방식에 맞게 도구를 빚어나갈 수 있도록 설계되었다.1 이는 노션(Notion)과 같은 도구가 정형화된 아키텍처를 제공하는 것과 대조적으로, 옵시디언은 비정형적인 아이디어들의 유기적 합성(Synthesis)을 지향한다는 점에서 차별화된다.8

| 비교 항목 | 옵시디언 (Obsidian) | 노션 (Notion) | 에버노트 (Evernote) |
| :---- | :---- | :---- | :---- |
| **저장 방식** | 로컬 기반 마크다운 파일 1 | 클라우드 기반 데이터베이스 2 | 클라우드 기반 독자 규격 |
| **데이터 주권** | 완전한 사용자 소유 2 | 서비스 제공업체 종속 7 | 서비스 제공업체 종속 |
| **네트워크 구조** | 양방향 링크 및 그래프 뷰 4 | 계층적 페이지 구조 7 | 노트북 및 태그 중심 |
| **커스터마이징** | CSS 및 수천 개의 플러그인 4 | 제공된 템플릿 및 블록 중심 | 제한적인 커스터마이징 |
| **프라이버시** | 종단간 암호화 동기화 9 | 서버 측 접근 가능성 존재 | 서버 측 접근 가능성 존재 |

## **제2장. 마크다운 엔진과 텍스트 처리 메커니즘**

옵시디언의 핵심은 표준 마크다운을 확장한 '옵시디언 플레이버 마크다운(Obsidian Flavored Markdown)'이다.10 마크다운은 텍스트에 의미론적 구조를 부여하는 동시에 쓰기 흐름을 방해하지 않는 간결함을 유지한다.6 사용자는 복잡한 서식 버튼을 누르는 대신 간단한 기호를 통해 문서의 위계를 설정하고 시각적 요소를 제어한다.6

### **2.1. 표준 및 확장 마크다운 구문**

옵시디언은 기본적인 굵기, 기울임, 목록 외에도 하이라이트, 취소선, 각주, 코드 블록 등을 지원한다.10 특히 내부 링크 시스템인 위키링크(Wikilinks)는 \[\[노트 제목\]\] 형식을 사용하여 다른 문서와의 연결을 지극히 단순화한다.4

| 스타일 | 구문 (Syntax) | 활용 및 인지적 의미 |
| :---- | :---- | :---- |
| **Bold** | \*\*텍스트\*\* | 핵심 키워드 강조 및 시각적 위계 형성 10 |
| *Italic* | \*텍스트\* | 강조 또는 외국어, 인용문 표기 10 |
| \==Highlight== | \==텍스트== | 능동적 읽기 및 핵심 문장 발췌 10 |
| \~\~Strikethrough\~\~ | \~\~텍스트\~\~ | 완료된 작업 또는 수정 이력 표시 10 |
| Code Block | \`\`\` | 프로그래밍 언어 문법 강조 및 기술적 기록 10 |
| Footnote | \[^1\] | 부연 설명 분리를 통한 본문 가독성 확보 10 |

### **2.2. 인라인 처리와 동적 렌더링**

사용자가 편집하는 동안 옵시디언은 '라이브 프리뷰(Live Preview)' 모드를 통해 마크다운 기호를 숨기고 렌더링된 결과를 즉각적으로 보여준다.12 이는 편집 모드와 읽기 모드 사이의 인지적 단절을 줄여준다. 또한 수식 처리를 위해 LaTeX 문법을 지원하여 $E=mc^2$와 같은 과학적 표기를 정교하게 렌더링할 수 있다.10

## **제3장. 워크스페이스 및 사용자 인터페이스(UI) 건축학**

옵시디언의 인터페이스는 일렉트론(Electron) 프레임워크를 기반으로 구축되었으며, 이는 데스크톱 앱임에도 불구하고 웹 기술을 활용한 무한한 커스터마이징을 가능케 한다.4 전체적인 구조는 중앙의 콘텐츠 영역을 중심으로 좌우의 기능적 사이드바와 상단의 탭 시스템으로 구성된다.14

### **3.1. 사이드바와 리본(Ribbon) 시스템**

* **왼쪽 사이드바**: 파일 탐색기, 검색 탭, 북마크 탭이 기본 배치된다. 파일 탐색기는 윈도우 익스플로러와 유사한 계층 구조를 제공하여 파일의 물리적 위치를 관리하게 한다.11  
* **오른쪽 사이드바**: 현재 활성화된 노트의 메타 정보를 다루는 탭들이 위치한다. 백링크, 나가는 링크, 개요(Outline), 그리고 프로퍼티 뷰가 포함된다.15  
* **리본(Ribbon)**: 화면 가장 왼쪽의 좁은 수직 바에는 새 노트 생성, 그래프 뷰 열기 등 자주 사용되는 명령 아이콘들이 배치되며, 사용자는 이를 자유롭게 재배치하거나 숨길 수 있다.14

### **3.2. 탭 그룹과 창 관리 (Tab Management)**

옵시디언의 UI는 현대적인 IDE(통합 개발 환경)와 유사한 창 분할 기능을 제공한다.16

* **탭 그룹 분할**: 화면을 수직 또는 수평으로 분할하여 여러 노트를 동시에 띄워놓고 대조할 수 있다.14  
* **탭 스태킹 (Stacked Tabs)**: 앤디 마투착의 '슬라이딩 노츠' 방식에서 영감을 받은 기능으로, 여러 노트를 층층이 쌓아 옆으로 밀어가며 읽을 수 있게 하여 긴 흐름의 연구 작업을 지원한다.18  
* **팝아웃 윈도우 (Pop-out Windows)**: 특정 탭을 별도의 창으로 분리하여 멀티 모니터 환경에서 효율적으로 작업할 수 있다.18

### **3.3. 명령 팔레트와 퀵 스위처**

키보드 중심의 워크플로우를 위해 옵시디언은 마우스 조작을 최소화하는 도구들을 갖추고 있다. Ctrl/Cmd \+ P로 호출되는 '명령 팔레트'는 앱 내의 모든 기능을 검색하여 실행할 수 있게 하며, Ctrl/Cmd \+ O인 '퀵 스위처'는 파일 이름을 검색하여 즉시 노트를 전환하게 한다.16

## **제4장. 그래프 뷰(Graph View): 지식의 공간적 시각화**

옵시디언을 상징하는 기능인 그래프 뷰는 노트 간의 관계를 네트워크 맵으로 구현한다.1 이는 단순한 시각적 효과를 넘어, 파편화된 정보들이 어떻게 클러스터를 형성하고 새로운 통찰로 이어지는지를 분석하는 강력한 지식 그래프 도구다.4

### **4.1. 전역 그래프와 로컬 그래프**

* **전역 그래프 (Global Graph)**: 전체 저장소(Vault)의 모든 연결 상태를 한눈에 보여준다. 데이터가 축적될수록 거대한 '디지털 뇌'의 형상을 띠게 되며, 지식의 밀도가 높은 지점을 시각적으로 즉각 파악할 수 있다.4  
* **로컬 그래프 (Local Graph)**: 현재 활성화된 노트를 중심으로 특정 단계(Depth)까지 연결된 노드들만 필터링하여 보여준다. 특정 주제의 맥락을 깊이 있게 탐색할 때 필수적이다.4

### **4.2. 물리 엔진과 사용자화 파라미터**

그래프 뷰는 WebGL을 기반으로 렌더링되며, 노드 간의 배치를 위해 실시간 물리 시뮬레이션을 수행한다.21 사용자는 설정을 통해 그래프의 거동을 세밀하게 조정할 수 있다.

| 파라미터 | 기능 및 인지적 영향 |
| :---- | :---- |
| **중심력 (Center Force)** | 그래프 전체를 중앙으로 끌어당기는 힘. 높을수록 원형의 조밀한 형태를 띰 21 |
| **반발력 (Repel Force)** | 노드들이 서로 밀쳐내는 힘. 클러스터 간의 간격을 벌려 가독성을 높임 21 |
| **링크 힘 (Link Force)** | 연결된 노드 사이의 결합력. 관련 아이디어들이 얼마나 긴밀하게 뭉칠지 결정 21 |
| **링크 거리 (Link Distance)** | 연결된 노드 간의 기본 간격. 클러스터의 시각적 크기를 조절 21 |

### **4.3. 그룹화 및 필터링**

사용자는 검색 쿼리를 기반으로 특정 노드 그룹에 색상을 부여할 수 있다.21 예를 들어 \#idea 태그가 달린 노트는 노란색으로, 특정 프로젝트 폴더 내의 노트는 파란색으로 표시하여 지식의 분포도를 입체적으로 분석할 수 있다.21 또한 첨부파일, 고립된 노트(Orphans), 존재하는 파일만 보기 등의 필터를 통해 그래프의 복잡도를 제어한다.21

## **제5장. 캔버스(Canvas): 무한한 공간에서의 시각적 사고**

캔버스는 텍스트의 선형적 구조를 넘어 무한한 2차원 평면에서 아이디어를 배치하고 연결할 수 있는 작업 공간을 제공한다.1 이는 단순한 화이트보드 기능을 넘어, 옵시디언 내의 실제 자산들과 깊이 있게 통합된 시각적 엔진이다.26

### **5.1. 카드 유형과 객체 임베딩**

캔버스에는 다양한 형태의 객체를 배치할 수 있다.26

* **텍스트 카드**: 캔버스 내에서 즉석으로 메모를 작성한다.  
* **노트 임베드**: 저장소 내의 기존 마크다운 파일을 불러와 화판 위에서 직접 편집한다.  
* **미디어 및 PDF**: 이미지, 비디오, 오디오 파일을 배치하고 PDF의 경우 특정 페이지를 고정하여 참조할 수 있다.  
* **웹 페이지**: URL을 붙여넣으면 대화형 웹 뷰가 생성되어 외부 정보를 실시간으로 참조한다.  
* **중첩 캔버스**: 캔버스 안에 다른 캔버스 파일을 삽입하여 거대한 프로젝트를 계층적으로 시각화한다.

### **5.2. 공간적 관계 설정과 그룹화**

카드 사이를 드래그하여 화살표로 연결할 수 있으며, 연결선에 텍스트 라벨을 추가하여 논리적 흐름을 명시할 수 있다.26 또한 여러 카드를 '그룹'으로 묶어 배경색을 지정하거나 이름을 붙임으로써 복잡한 다이어그램 내의 구역을 설정할 수 있다.26 이는 특히 프로젝트 관리, 스토리보드 작성, 복잡한 시스템 아키텍처 설계에 탁월한 효율을 발휘한다.22

## **제6장. 프로퍼티(Properties): 메타데이터의 구조화와 데이터베이스화**

옵시디언의 '프로퍼티' 기능은 비정형 마크다운 문서에 정형화된 데이터 속성을 부여하는 메커니즘이다.28 과거 YAML 프런트매터라 불리던 텍스트 기반 설정을 세련된 UI로 변모시킨 것으로, 노트를 단순한 문서가 아닌 '데이터 개체'로 다룰 수 있게 한다.20

### **6.1. 지원 데이터 타입과 제약 사항**

각 프로퍼티는 고유한 유형을 가지며, 이는 옵시디언이 데이터를 처리하는 방식을 결정한다.30

| 타입 (Type) | 상세 설명 및 활용 사례 |
| :---- | :---- |
| **Text** | 단일 라인 텍스트 정보 (예: 저자명, 출처 URL) 30 |
| **List** | 다중 값 포함. 태그나 공동 작업자 목록 작성 시 유용 30 |
| **Number** | 숫자 값. 평점, 진행률, 예산 등 수치 데이터 관리 30 |
| **Checkbox** | 불리언(True/False). 완료 여부나 확인 사항 체크 30 |
| **Date / Time** | ISO 8601 형식 준수. 생성일, 마감 기한 설정 및 캘린더 연동 30 |
| **Tags** | 옵시디언 전역 태그 시스템과 직접 연동되는 특수 타입 30 |

### **6.2. 프로퍼티 뷰와 전역 관리**

'프로퍼티 뷰' 코어 플러그인을 활성화하면 볼트 내의 모든 프로퍼티를 일목요연하게 파악할 수 있다.29 특정 프로퍼티가 사용된 빈도를 확인하거나, 이름을 전역적으로 변경(Rename globally)할 수 있는 기능을 제공하여 데이터의 일관성을 유지하게 한다.29 이러한 구조화된 데이터는 'Dataview' 플러그인과 결합할 때 진정한 위력을 발휘하며, 사용자는 간단한 쿼리 문법을 통해 수천 개의 노트 중에서 조건에 맞는 데이터만 추출하여 테이블이나 보드 형태로 동적 생성할 수 있다.7

## **제7장. 검색 시스템: 고차원적 정보 인덱싱**

옵시디언의 검색은 단순 텍스트 매칭을 넘어선다. 코어 플러그인인 'Search'는 강력한 검색 연산자와 정규 표현식(Regex)을 지원하여 대규모 지식 베이스에서도 원하는 정보를 정밀하게 추출한다.34

### **7.1. 고급 검색 연산자 명세**

| 연산자 | 기능 설명 | 활용 예시 |
| :---- | :---- | :---- |
| file: | 파일 이름 내 텍스트 매칭 | file:202309 (특정 날짜 노트 탐색) |
| path: | 특정 폴더 경로 내 검색 | path:"3-Resources/Papers" |
| tag: | 태그 기반 검색 (코드 블록 제외 등 최적화) | tag:\#idea/spark |
| line: | 동일한 행에 검색어들이 포함된 경우 | line:(단백질 합성) |
| block: | 동일한 마크다운 블록 내 단어 조합 검색 | block:(소크라테스 대화법) |
| section: | 동일한 헤더 섹션(두 헤더 사이) 내 검색 | section:(원인 결과) |
| task: | 체크리스트 항목 내 텍스트 검색 | task-todo:메일보내기 |

### **7.2. 검색 쿼리 임베딩과 북마크**

검색어 자체를 문서 내에 임베딩하여 항상 최신 검색 결과를 보여주는 기능(\`\`\`query)을 지원한다.34 또한 자주 사용하는 복잡한 검색 쿼리는 북마크 시스템에 저장하여 사이드바에서 원클릭으로 접근할 수 있다.35 이는 사용자가 수동으로 노트를 분류하는 수고를 덜어주고, 검색을 통한 동적 구조 형성을 가능케 한다.36

## **제8장. 동기화 및 보안 아키텍처: 옵시디언 싱크(Sync)**

로컬 데이터를 기기 간에 공유하기 위해 옵시디언은 강력한 보안이 적용된 자체 동기화 서비스를 제공한다.1 이는 클라우드 서비스임에도 불구하고 로컬 우선 철학을 훼손하지 않도록 설계되었다.5

### **8.1. 종단간 암호화 (E2EE)**

옵시디언 싱크는 사용자의 데이터를 기기에서 떠나기 직전에 암호화하고, 오직 사용자의 다른 기기에서만 복호화할 수 있는 종단간 암호화를 기본으로 한다.9 암호화에는 AES-256 GCM 알고리즘이 사용되며, 키 유도 함수로는 scrypt를 활용한다.9 옵시디언 팀조차 사용자의 비밀번호 없이는 데이터 내용을 열람할 수 없도록 설계되어 프라이버시를 극대화한다.9

### **8.2. 버전 히스토리와 복구**

* **버전 관리**: 수정 사항을 약 10초마다 체크하여 서버에 저장한다.38 스탠다드 플랜은 1개월, 플러스 플랜은 12개월의 버전 히스토리를 보관하여 실수로 인한 데이터 손실을 원천 차단한다.37  
* **선택적 동기화**: 특정 폴더를 제외하거나, 이미지, 오디오, 비디오 등 대용량 첨부파일의 동기화 여부를 기기별로 설정할 수 있어 모바일 기기의 저장 공간을 효율적으로 관리할 수 있다.37  
* **결함 탐지**: 결정론적 파일 해시(Deterministic file hashes)를 사용하여 중복 파일을 감지하고 대역폭 소모를 줄인다.9

## **제9장. 웹 발행과 디지털 가든: 옵시디언 퍼블리시(Publish)**

옵시디언의 노트를 온라인에 즉시 공개하여 위키나 개인 지식 사이트로 구축할 수 있는 기능이다.1 이는 마크다운 파일을 웹 표준으로 변환하여 호스팅하는 서비스로, '디지털 가든' 문화를 선도하고 있다.41

### **9.1. SEO 및 커스터마이징**

* **검색 엔진 최적화**: 사이트맵 생성, 메타데이터 설정, RSS 피드 등을 자동으로 지원하여 구글 등의 검색 결과에 잘 노출되도록 돕는다.42  
* **심미적 제어**: publish.css와 publish.js 파일을 통해 웹사이트의 디자인과 동작을 무한히 수정할 수 있다.43 커뮤니티 테마의 CSS를 복사하여 적용하는 것도 가능하다.43  
* **대화형 요소**: 웹에서도 그래프 뷰와 목차(TOC) 기능을 제공하여 방문자가 지식 네트워크를 탐험할 수 있는 환경을 조성한다.41

### **9.2. 커스텀 도메인 기술 명세**

사용자는 본인 소유의 도메인을 연결할 수 있으며, 클라우드플레어(Cloudflare)를 통한 CNAME 설정이나 NGINX, Apache 등의 리버스 프록시(Reverse Proxy) 설정을 지원한다.44 특히 클라우드플레어를 사용할 경우 SSL/TLS를 'Full' 모드로 설정하여 보안 연결을 확보해야 한다.44

## **제10장. 전문 워크플로우 분석: 학술 연구와 STEM 분야의 적용**

옵시디언은 특히 데이터 간의 복잡한 연결이 중요한 학계와 기술 분야에서 독보적인 가치를 인정받고 있다.8

### **10.1. 학술지 관리 및 논문 작성**

PhD 과정의 연구자들은 옵시디언을 Zettelkasten 시스템의 디지털 구현체로 활용한다.47

* **Zotero 연동**: Zotero에서 추출한 인용 정보를 마크다운 파일로 변환하여 저장하고, 논문의 각 아이디어를 원자적 노트로 분리한다.33  
* **의미론적 태깅**: 단순 태그 대신 \#source/paper, \#topic, \#concept 등의 위계적 태그를 사용하여 정보의 성격을 규정한다.47  
* **관계 추적**: "이 실험 결과가 어떤 논문에서 제안된 가설을 지지하는가?"와 같은 복합적인 질문에 답하기 위해 백링크와 로컬 그래프를 활용한다.49

### **10.2. STEM 프로젝트 및 실험 로그**

생물학 연구나 소프트웨어 개발 프로젝트에서 옵시디언은 실험실 노트(Lab Notebook) 역할을 수행한다.48

* **실험 프로토콜 관리**: Templater를 통해 실험 단계별 체크리스트와 결과 기록 양식을 자동 생성한다.33  
* **세포주 및 시약 계보**: 특정 세포주의 계대(Passage) 정보를 링크로 연결하여 실험의 재현성을 확보하고 트러블슈팅 시간을 단축한다.49

## **제11장. 디자인 비평 및 한계점 분석 (UI/UX Critique)**

탁월한 기능성에도 불구하고 옵시디언은 몇 가지 구조적인 결함과 사용자 경험상의 불편함을 안고 있다.46

### **11.1. 높은 진입 장벽과 학습 곡선**

옵시디언은 사용자에게 마크다운 문법과 제텔카스텐과 같은 방법론에 대한 사전 지식을 요구한다.2 초기 설정 과정이 복잡하고 '빈 볼트(Empty Vault)' 상태에서 시작해야 하므로, 노션과 같은 템플릿 중심 앱에 익숙한 사용자들은 위압감을 느끼기 쉽다.2

### **11.2. 모바일 경험의 불일치**

데스크톱 앱을 모바일로 이식하는 과정에서 발생한 UX 결함들이 존재한다.50

* **텍스트 입력 오류**: 안드로이드 환경에서 일부 키보드와의 호환성 문제로 인해 글자가 중복 입력되거나 삭제되는 버그가 보고된다.50  
* **UI 복잡성**: 데스크톱의 다중 탭 및 사이드바 구조가 작은 화면에서는 직관적이지 않으며, 특히 텍스트 선택이나 체크리스트 조작 시 불필요하게 많은 클릭이 필요하다.11  
* **초기 로딩 지연**: 수천 개의 노트와 플러그인이 로드되는 동안 모바일 앱 실행 속도가 현저히 느려져 '빠른 캡처'라는 모바일 본연의 목적을 저해한다.40

### **11.3. 협업 기능의 부재**

옵시디언은 철저히 개인 중심의 도구로 설계되었기 때문에, 구글 독스나 노션과 같은 실시간 동시 편집(Real-time collaboration) 기능을 기본적으로 지원하지 않는다.1 팀 단위의 프로젝트 수행 시에는 별도의 공유 볼트 설정이나 복잡한 동기화 환경 구축이 필요하다.1

## **제12장. 결론: 지식 도구의 진화와 미래적 함의**

옵시디언은 단순한 메모 앱을 넘어 개인이 자신의 디지털 영토를 구축하고 지적 자산을 관리하는 방식에 혁신을 가져왔다. 로컬 우선주의와 네트워크적 사고의 결합은 사용자가 도구의 노예가 아닌 주인이 되도록 하며, 파편화된 데이터들을 연결하여 새로운 통찰을 이끌어내는 인지적 촉매제 역할을 한다.1

전문가급 사용자의 관점에서 옵시디언은 기술적 자유도와 지적 확장성의 균형을 맞춘 최적의 플랫폼이다. 비록 모바일 UI의 최적화나 협업 도구로서의 한계가 명확하지만, 커뮤니티 주도의 플러그인 생태계와 견고한 개발 철학은 옵시디언이 향후 디지털 지식 관리의 표준으로 자리매김할 가능성을 강력히 시사한다.4 사용자가 직접 빚어낸 이 '디지털 뇌'는 시간이 흐를수록 더 정교한 네트워크를 형성하며, 단순한 기록 보관소를 넘어 창의적 생산의 근원지로 기능하게 될 것이다.2

#### **Works cited**

1. Obsidian \- Sharpen your thinking, accessed April 27, 2026, [https://obsidian.md/](https://obsidian.md/)  
2. Obsidian Review 2026: What I Discovered While Testing \- Lindy, accessed April 27, 2026, [https://www.lindy.ai/blog/obsidian-review](https://www.lindy.ai/blog/obsidian-review)  
3. An Obsidian Philosophy for Life \- PhD20, accessed April 27, 2026, [https://phd20.com/blog/obsidian-life-philosophy/](https://phd20.com/blog/obsidian-life-philosophy/)  
4. Obsidian App: In-Depth Product Teardown | by Aditya Raj \- Medium, accessed April 27, 2026, [https://medium.com/design-bootcamp/obsidian-app-in-depth-product-teardown-6d685930a367](https://medium.com/design-bootcamp/obsidian-app-in-depth-product-teardown-6d685930a367)  
5. Obsidian.md software and Sync service review | Bike Gremlin I/O, accessed April 27, 2026, [https://io.bikegremlin.com/39287/obsidian-md-software-and-sync-service-review/](https://io.bikegremlin.com/39287/obsidian-md-software-and-sync-service-review/)  
6. Obsidian Markdown Made Ridiculously Simple \- YouTube, accessed April 27, 2026, [https://www.youtube.com/watch?v=NX1Sht1tAA0](https://www.youtube.com/watch?v=NX1Sht1tAA0)  
7. Obsidian vs Notion (2026): Features, Graph View, Pricing & Which Is Best for You \- Pixno, accessed April 27, 2026, [https://photes.io/blog/posts/obsidian-vs-notion](https://photes.io/blog/posts/obsidian-vs-notion)  
8. Studying Philosophy using Obsidian? : r/ObsidianMD \- Reddit, accessed April 27, 2026, [https://www.reddit.com/r/ObsidianMD/comments/1r8ee4r/studying\_philosophy\_using\_obsidian/](https://www.reddit.com/r/ObsidianMD/comments/1r8ee4r/studying_philosophy_using_obsidian/)  
9. Security and privacy \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/Security+and+privacy](https://obsidian.md/help/Security+and+privacy)  
10. Basic formatting syntax \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/syntax](https://obsidian.md/help/syntax)  
11. Obsidian Review: Not Just a Planning Tool? \- Reedsy, accessed April 27, 2026, [https://reedsy.com/studio/resources/obsidian-review](https://reedsy.com/studio/resources/obsidian-review)  
12. When using Canvas is the graph view useless? : r/ObsidianMD \- Reddit, accessed April 27, 2026, [https://www.reddit.com/r/ObsidianMD/comments/1iuaino/when\_using\_canvas\_is\_the\_graph\_view\_useless/](https://www.reddit.com/r/ObsidianMD/comments/1iuaino/when_using_canvas_is_the_graph_view_useless/)  
13. The 2026 Obsidian Report Card \- Practical PKM, accessed April 27, 2026, [https://practicalpkm.com/2026-obsidian-report-card/](https://practicalpkm.com/2026-obsidian-report-card/)  
14. Workspace \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/workspace](https://obsidian.md/help/workspace)  
15. Sidebar \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/sidebar](https://obsidian.md/help/sidebar)  
16. A Guide to Obsidian: Local, Markdown-Powered Networked Notes ..., accessed April 27, 2026, [https://www.sitepoint.com/obsidian-beginner-guide/](https://www.sitepoint.com/obsidian-beginner-guide/)  
17. Ribbon \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/ribbon](https://obsidian.md/help/ribbon)  
18. Tabs \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/tabs](https://obsidian.md/help/tabs)  
19. Core plugins \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/plugins](https://obsidian.md/help/plugins)  
20. My essential and useful Obsidian plugins \- Share & showcase, accessed April 27, 2026, [https://forum.obsidian.md/t/my-essential-and-useful-obsidian-plugins/64190](https://forum.obsidian.md/t/my-essential-and-useful-obsidian-plugins/64190)  
21. Graph view \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/plugins/graph](https://obsidian.md/help/plugins/graph)  
22. 3 smart ways I use Obsidian to supercharge my productivity \- XDA Developers, accessed April 27, 2026, [https://www.xda-developers.com/ways-i-use-obsidian-to-supercharge-productivity/](https://www.xda-developers.com/ways-i-use-obsidian-to-supercharge-productivity/)  
23. Graph view customization \- Obsidian Hub, accessed April 27, 2026, [https://publish.obsidian.md/hub/04+-+Guides%2C+Workflows%2C+%26+Courses/Guides/Graph+view+customization](https://publish.obsidian.md/hub/04+-+Guides%2C+Workflows%2C+%26+Courses/Guides/Graph+view+customization)  
24. How I use GRAPH VIEW in Obsidian \- YouTube, accessed April 27, 2026, [https://www.youtube.com/watch?v=5x5ua7LecOI](https://www.youtube.com/watch?v=5x5ua7LecOI)  
25. Finally a plugin that makes the graph useful\! : r/ObsidianMD \- Reddit, accessed April 27, 2026, [https://www.reddit.com/r/ObsidianMD/comments/1nh1yyh/finally\_a\_plugin\_that\_makes\_the\_graph\_useful/](https://www.reddit.com/r/ObsidianMD/comments/1nh1yyh/finally_a_plugin_that_makes_the_graph_useful/)  
26. Obsidian Canvas \- Visualize your ideas, accessed April 27, 2026, [https://obsidian.md/canvas](https://obsidian.md/canvas)  
27. Canvas: Links in Cards and Outgoing Arrows in Graph View \- Page 3 \- Feature requests, accessed April 27, 2026, [https://forum.obsidian.md/t/canvas-links-in-cards-and-outgoing-arrows-in-graph-view/49697?page=3](https://forum.obsidian.md/t/canvas-links-in-cards-and-outgoing-arrows-in-graph-view/49697?page=3)  
28. Properties \- Obsidian Help, accessed April 27, 2026, [https://help.obsidian.md/Editing+and+formatting/Properties](https://help.obsidian.md/Editing+and+formatting/Properties)  
29. Properties view \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/plugins/properties](https://obsidian.md/help/plugins/properties)  
30. Properties \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/properties](https://obsidian.md/help/properties)  
31. A Complete Guide to Obsidian Properties \- Practical PKM, accessed April 27, 2026, [https://practicalpkm.com/complete-guide-to-obsidian-properties/](https://practicalpkm.com/complete-guide-to-obsidian-properties/)  
32. Must-have plugins? : r/ObsidianMD \- Reddit, accessed April 27, 2026, [https://www.reddit.com/r/ObsidianMD/comments/1im4cfn/musthave\_plugins/](https://www.reddit.com/r/ObsidianMD/comments/1im4cfn/musthave_plugins/)  
33. How to Boost Your Productivity for Scientific Research Using Obsidian \- Better Humans, accessed April 27, 2026, [https://betterhumans.pub/how-to-boost-your-productivity-for-scientific-research-using-obsidian-fe85c98c63c8](https://betterhumans.pub/how-to-boost-your-productivity-for-scientific-research-using-obsidian-fe85c98c63c8)  
34. Search \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/plugins/search](https://obsidian.md/help/plugins/search)  
35. Overwhelmed by Obsidian? Folders, Tags & Properties Explained\! \- YouTube, accessed April 27, 2026, [https://www.youtube.com/watch?v=92p9R-obLe0](https://www.youtube.com/watch?v=92p9R-obLe0)  
36. Obsidian (core plugin) Bookmarks. Note: This (updated) notation traces… | by Steven Thompson | A Voice in the Conversation | Medium, accessed April 27, 2026, [https://medium.com/a-voice-in-the-conversation/obsidian-core-plugin-bookmarks-10e91d3ce89f](https://medium.com/a-voice-in-the-conversation/obsidian-core-plugin-bookmarks-10e91d3ce89f)  
37. Obsidian Sync, accessed April 27, 2026, [https://obsidian.md/sync](https://obsidian.md/sync)  
38. Obsidian Sync \- Obsibian Template for Gatsby Theme Primer Wiki, accessed April 27, 2026, [https://demo-obsidian.owenyoung.com/Licenses%20&%20add-on%20services/Obsidian%20Sync/](https://demo-obsidian.owenyoung.com/Licenses%20&%20add-on%20services/Obsidian%20Sync/)  
39. Version history \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/sync/version-history](https://obsidian.md/help/sync/version-history)  
40. 2025 Obsidian Report Card \- Practical PKM, accessed April 27, 2026, [https://practicalpkm.com/2025-obsidian-report-card/](https://practicalpkm.com/2025-obsidian-report-card/)  
41. Introduction to Obsidian Publish \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/publish](https://obsidian.md/help/publish)  
42. SEO \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/publish/seo](https://obsidian.md/help/publish/seo)  
43. Customize your site \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/publish/customize](https://obsidian.md/help/publish/customize)  
44. Custom domains \- Obsidian Help, accessed April 27, 2026, [https://obsidian.md/help/Custom+domains](https://obsidian.md/help/Custom+domains)  
45. Custom domains \- Obsidian \- Mintlify, accessed April 27, 2026, [https://www.mintlify.com/obsidianmd/obsidian-help/publish/custom-domains](https://www.mintlify.com/obsidianmd/obsidian-help/publish/custom-domains)  
46. Obsidian Reviews, Pros and Cons \- 2026 Software Advice, accessed April 27, 2026, [https://www.softwareadvice.com/help-desk/obsidian-profile/reviews/](https://www.softwareadvice.com/help-desk/obsidian-profile/reviews/)  
47. How I use Obsidian for academic work \- Emile van Krieken, accessed April 27, 2026, [https://www.emilevankrieken.com/blog/2025/academic-obsidian/](https://www.emilevankrieken.com/blog/2025/academic-obsidian/)  
48. Science Research Vault – A Structured Workflow for Academics \- Obsidian Forum, accessed April 27, 2026, [https://forum.obsidian.md/t/science-research-vault-a-structured-workflow-for-academics/95589](https://forum.obsidian.md/t/science-research-vault-a-structured-workflow-for-academics/95589)  
49. PhD Productivity Hacks: My Obsidian Vault Template | leonardo silva, accessed April 27, 2026, [https://www.lsilvam.xyz/posts/obsidian-template/](https://www.lsilvam.xyz/posts/obsidian-template/)  
50. Unified Note-Taking Mastery: Obsidian Mobile & Desktop Experience \- Fibery, accessed April 27, 2026, [https://fibery.io/openion/obsidian-115/unified-note-taking-mastery-obsidian-mobile-desktop-experience-385344](https://fibery.io/openion/obsidian-115/unified-note-taking-mastery-obsidian-mobile-desktop-experience-385344)  
51. Very disappointing experience with Obsidian, any tips? : r/ObsidianMD \- Reddit, accessed April 27, 2026, [https://www.reddit.com/r/ObsidianMD/comments/1q1shr8/very\_disappointing\_experience\_with\_obsidian\_any/](https://www.reddit.com/r/ObsidianMD/comments/1q1shr8/very_disappointing_experience_with_obsidian_any/)  
52. Obsidian Reviews 2026\. Verified Reviews, Pros & Cons \- Capterra, accessed April 27, 2026, [https://www.capterra.com/p/236468/Obsidian/reviews/](https://www.capterra.com/p/236468/Obsidian/reviews/)  
53. Question \- Desktop UI / New mobile UI : r/ObsidianMD \- Reddit, accessed April 27, 2026, [https://www.reddit.com/r/ObsidianMD/comments/1qcsumd/question\_desktop\_ui\_new\_mobile\_ui/](https://www.reddit.com/r/ObsidianMD/comments/1qcsumd/question_desktop_ui_new_mobile_ui/)  
54. Obsidian for Android review \- 2025 \- Note Apps, accessed April 27, 2026, [https://www.noteapps.ca/obsidian-for-android-review-2025/](https://www.noteapps.ca/obsidian-for-android-review-2025/)