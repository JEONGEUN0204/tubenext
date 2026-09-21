import { describe, expect, it } from "vitest";
import { extractKeywords, tokenizeTitle, tokenizeTitles } from "@/lib/keywords";

describe("tokenizeTitle", () => {
  it("특수문자·불용어·숫자만 토큰을 버리고 나머지를 남긴다", () => {
    expect(tokenizeTitle("[3천원 자취] 김치볶음밥 만들기 #shorts")).toEqual([
      "3천원",
      "자취",
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
});
