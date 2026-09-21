import { describe, expect, it } from "vitest";
import { extractKeywords, tokenizeTitle, tokenizeTitles } from "@/lib/keywords";

describe("tokenizeTitle", () => {
  it("대괄호 블록·특수문자·불용어를 버리고 나머지를 남긴다", () => {
    expect(tokenizeTitle("[3천원 자취] 김치볶음밥 만들기 #shorts")).toEqual([
      "김치볶음밥",
      "만들기",
    ]);
  });

  it("이모지와 구분기호를 공백으로 치환하고 길이 1 토큰을 버린다", () => {
    expect(tokenizeTitle("🔥 매운맛 챌린지 | 1")).toEqual(["매운맛", "챌린지"]);
  });

  it("숫자만으로 이루어진 토큰과 불용어를 버린다", () => {
    expect(tokenizeTitle("오늘 2024 정말 김밥 3000 만들기")).toEqual([
      "김밥",
      "만들기",
    ]);
  });

  it("영문을 소문자로 통일한다", () => {
    expect(tokenizeTitle("Vlog EP 12 도쿄 Cafe Tour")).toEqual([
      "도쿄",
      "cafe",
      "tour",
    ]);
  });

  it("포맷 단어는 불용어가 아니다", () => {
    expect(tokenizeTitle("브이로그 리뷰 먹방 챌린지 튜토리얼")).toEqual([
      "브이로그",
      "리뷰",
      "먹방",
      "챌린지",
      "튜토리얼",
    ]);
  });

  it("조사를 떼지 않는다", () => {
    expect(tokenizeTitle("김치를 볶았다")).toEqual(["김치를", "볶았다"]);
  });

  it("특수문자뿐인 제목은 빈 배열이다", () => {
    expect(tokenizeTitle("!!! --- ㅋㅋㅋ")).toEqual([]);
    expect(tokenizeTitle("")).toEqual([]);
  });

  it("대괄호 블록은 안의 내용까지 통째로 버린다", () => {
    expect(tokenizeTitle("[출장 중 배고파_칭다오] 단골 꼬칫집")).toEqual([
      "단골",
      "꼬칫집",
    ]);
  });

  it("【】와 <>도 블록 통째로 버린다", () => {
    expect(tokenizeTitle("【공지】 콩국수 만들기")).toEqual([
      "콩국수",
      "만들기",
    ]);
    expect(tokenizeTitle("<리뷰> 콩국수 만들기")).toEqual([
      "콩국수",
      "만들기",
    ]);
  });

  it("닫는 괄호가 없으면 여는 괄호만 버리고 내용은 남긴다", () => {
    expect(tokenizeTitle("[출장 중 배고파 칭다오 노포")).toEqual([
      "출장",
      "배고파",
      "칭다오",
      "노포",
    ]);
  });

  it("소괄호는 블록으로 버리지 않는다", () => {
    expect(tokenizeTitle("콩국수 (여름 한정)")).toEqual([
      "콩국수",
      "여름",
      "한정",
    ]);
  });

  it("숫자로 시작하는 토큰을 버린다", () => {
    expect(tokenizeTitle("전국 2주 팝업")).toEqual(["전국", "팝업"]);
    expect(tokenizeTitle("7천원으로 여름 나는 법")).toEqual(["여름", "나는"]);
  });
});

describe("tokenizeTitles", () => {
  it("어간이 다른 제목에 단독으로 있으면 1자 조사를 뗀다", () => {
    expect(tokenizeTitles(["김치를 볶았다", "김치 맛있게"])).toEqual([
      ["김치", "볶았다"],
      ["김치", "맛있게"],
    ]);
  });

  it("어간이 어디에도 없으면 1자 조사를 떼지 않는다", () => {
    expect(tokenizeTitles(["고양이 밥주기", "고양이 간식"])).toEqual([
      ["고양이", "밥주기"],
      ["고양이", "간식"],
    ]);
    expect(tokenizeTitles(["김치를 볶았다"])).toEqual([["김치를", "볶았다"]]);
  });

  it("길이 3 미만 어간이 남는 1자 조사는 떼지 않는다", () => {
    expect(tokenizeTitles(["집으로 가는 길"])).toEqual([["집으로", "가는"]]);
  });

  it("2자 조사는 어간이 집합에 없어도 뗀다", () => {
    expect(tokenizeTitles(["쿠팡에서 산 물건"])).toEqual([["쿠팡", "물건"]]);
    expect(tokenizeTitles(["쿠팡에서 산 물건", "쿠팡 배송 후기"])).toEqual([
      ["쿠팡", "물건"],
      ["쿠팡", "배송", "후기"],
    ]);
  });

  it("정규화한 뒤 불용어가 되면 걸러낸다", () => {
    expect(tokenizeTitles(["여러분에게 드리는 라면 레시피"])).toEqual([
      ["드리는", "라면", "레시피"],
    ]);
  });

  it("빈 입력은 빈 배열이다", () => {
    expect(tokenizeTitles([])).toEqual([]);
  });
});

describe("extractKeywords", () => {
  const cookingTitles = [
    "자취 요리 김치찌개",
    "자취 요리 된장찌개",
    "혼밥 라면",
  ];

  it("2회 이상 등장한 바이그램을 유니그램보다 먼저 고른다", () => {
    expect(extractKeywords(cookingTitles)[0]).toBe("자취 요리");
  });

  it("이미 고른 키워드에 포함되는 후보는 건너뛴다", () => {
    const keywords = extractKeywords(cookingTitles);

    expect(keywords).toEqual(["자취 요리", "김치찌개", "된장찌개"]);
    expect(keywords).not.toContain("자취");
    expect(keywords).not.toContain("요리");
  });

  it("1회만 등장한 바이그램은 후보가 아니다", () => {
    expect(extractKeywords(["혼밥 라면", "김치 볶음밥"])).toEqual([
      "혼밥",
      "라면",
      "김치",
    ]);
  });

  it("유니그램은 빈도 내림차순, 같으면 먼저 등장한 순서다", () => {
    expect(
      extractKeywords(["캠핑 장비 후기", "백패킹 캠핑", "캠핑 요리"]),
    ).toEqual(["캠핑", "장비", "후기"]);
  });

  it("excludeTokens에 있는 토큰은 대소문자 무시하고 제외한다", () => {
    expect(
      extractKeywords(["침착맨 라면 먹방", "침착맨 라면 리뷰"], {
        excludeTokens: ["침착맨"],
      }),
    ).toEqual(["라면", "먹방", "리뷰"]);

    expect(
      extractKeywords(["TubeNext 라면 먹방", "tubenext 라면 리뷰"], {
        excludeTokens: ["TubeNext"],
      }),
    ).toEqual(["라면", "먹방", "리뷰"]);
  });

  it("기본 limit은 3이고 limit을 넘기면 그 개수만 반환한다", () => {
    expect(extractKeywords(cookingTitles)).toHaveLength(3);
    expect(extractKeywords(cookingTitles, { limit: 1 })).toEqual(["자취 요리"]);
    expect(extractKeywords(cookingTitles, { limit: 5 })).toEqual([
      "자취 요리",
      "김치찌개",
      "된장찌개",
      "혼밥",
      "라면",
    ]);
  });

  it("후보가 모자라면 있는 만큼만 반환한다", () => {
    expect(extractKeywords(["라면"])).toEqual(["라면"]);
  });

  it("빈 입력과 특수문자뿐인 제목은 빈 배열이다", () => {
    expect(extractKeywords([])).toEqual([]);
    expect(extractKeywords(["🔥🔥 !!! ---", "|||"])).toEqual([]);
  });

  it("같은 입력에 항상 같은 출력을 낸다", () => {
    expect(extractKeywords(cookingTitles)).toEqual(
      extractKeywords(cookingTitles),
    );
  });

  // 실제 채널(@paik_jongwon)에서 관찰된 결함.
  // 시리즈명·프로모션 문구가 2회씩 흩어진 소재어를 빈도로 눌러 키워드를 전부 차지했다.
  // 괄호 밖에 단독으로 나오는 `출장`(2개 제목)·`전국`(3개 제목)은 형태 규칙으로
  // 걸러낼 근거가 없어 남는다. 여기서 거르는 것은 괄호에 갇힌 시리즈명뿐이다.
  const seriesNoiseTitles = [
    "이게 왜 맛있지?",
    "버터 한 조각으로 끝내는 버터간장국수",
    '[출장 중 배고파_칭다오] "일 끝나고 먹는 첫입" 출장길 피로 싹 풀어주는 찐 단골 꼬칫집!',
    "[출장 중 배고파_일본 오사카] 출장 왔는데 야키니쿠는 못 참죠",
    '[출장 중 배고파_칭다오] "출장 오면 여길 꼭 갑니다" 백종원의 숨겨둔 칭다오 노포 첫 번째!',
    '직원피셜 "저희만 먹기 미안했어요" [돼지국밥짬뽕] 전국 2주 팝업!',
    '광주의 명물이 될 "애호박찌개짬뽕"의 등장! 전국 2주 팝업',
    "🚨전국 딱 2주! 지역에서만 먹을 수 있던 홍콩반점 메뉴가 찾아옵니다! (+2,000원 할인)",
    "콩국수는 소금이다 vs 설탕이다?",
    "콩국수, 집에서 만들면 이런 맛입니다.",
    "야식은 가볍게, 만족감은 크게! 나초타코",
    "축구 보며 먹는 '멕시코 맛' 간단간식! 나초타코",
  ];

  it("대괄호 안에만 있는 시리즈명과 기간 표기는 키워드가 되지 않는다", () => {
    // 수정 전 결과는 ['출장 배고파', '전국 2주', '배고파 칭다오']였다.
    // 바이그램 안에 숨은 노이즈는 배열 원소 비교로 못 잡으니 이어 붙여서 본다.
    const joined = extractKeywords(seriesNoiseTitles).join(" ");

    // `출장 배고파`·`배고파 칭다오`가 여기서 사라진다.
    expect(joined).not.toContain("배고파");
    expect(joined).not.toContain("칭다오");
    // `전국 2주`의 `2주`가 여기서 사라진다.
    expect(joined).not.toContain("2주");
  });

  it("괄호 안 시리즈명보다 괄호 밖 소재어를 키워드로 고른다", () => {
    // 시리즈명이 소재어보다 자주 나와도(3회 대 2회) 괄호에 갇혀 있으면 세지 않는다.
    const keywords = extractKeywords([
      "[출장 중 배고파_칭다오] 노포 꼬칫집 탐방",
      "[출장 중 배고파_오사카] 야키니쿠 맛집",
      "[출장 중 배고파_방콕] 길거리 국수",
      "콩국수 이렇게 만드세요",
      "콩국수 소금이냐 설탕이냐",
    ]);

    expect(keywords).toContain("콩국수");
    expect(keywords.join(" ")).not.toContain("배고파");
  });
});
