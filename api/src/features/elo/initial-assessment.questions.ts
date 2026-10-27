// Bộ câu hỏi đánh giá Elo ban đầu cho ĐÁNH ĐÔI (cầu lông) — phiên bản
// `initial_doubles_v1`. Đây là NGUỒN CHUẨN duy nhất về nội dung câu hỏi, điểm
// đáp án và trọng số: frontend chỉ nhận phần công khai (xem
// `toPublicQuestions`) và chỉ gửi lại mã câu hỏi + mã đáp án.
//
// Mọi mốc/trọng số dưới đây là GIẢ ĐỊNH sản phẩm ban đầu để chạy thử, không phải
// chuẩn chính thức của cầu lông; cần kiểm chứng trên người dùng thật.
//
// QUAN TRỌNG: `internalNote` là note NỘI BỘ — tuyệt đối không đưa vào response
// của API dành cho người chơi. Muốn đổi nội dung/điểm/trọng số thì tạo phiên bản
// mới (vd. `initial_doubles_v2`), KHÔNG sửa tại chỗ v1: câu trả lời cũ đã lưu
// kèm snapshot của v1 để còn diễn giải được.

export const INITIAL_ASSESSMENT_VERSION = "initial_doubles_v1"

/** Mã lựa chọn hợp lệ; thứ tự A→D tương ứng điểm 0→3. */
export type OptionId = "A" | "B" | "C" | "D"
export const OPTION_IDS: readonly OptionId[] = ["A", "B", "C", "D"]

export interface QuestionOption {
  id: OptionId
  text: string
  /** Điểm gốc của đáp án (0–3). Không bao giờ trả qua API công khai. */
  points: number
}

export interface QuestionDefinition {
  id: string
  /** Tên chủ đề ngắn của câu hỏi. */
  topic: string
  /** Nội dung câu hỏi hiển thị cho người chơi. */
  text: string
  /** Mô tả bổ sung hiển thị cho người chơi (nếu có). */
  description?: string
  /** Trọng số câu hỏi. Không trả qua API công khai. */
  weight: number
  /** Đúng 4 lựa chọn A–D theo thứ tự. */
  options: readonly QuestionOption[]
  /** Note nội bộ: mục tiêu, lý do chọn trọng số, lưu ý. KHÔNG hiển thị. */
  internalNote: string
}

/** Dựng 4 lựa chọn A–D; điểm suy ra từ vị trí (0,1,2,3). */
function opts(
  a: string,
  b: string,
  c: string,
  d: string
): readonly QuestionOption[] {
  return [
    { id: "A", text: a, points: 0 },
    { id: "B", text: b, points: 1 },
    { id: "C", text: c, points: 2 },
    { id: "D", text: d, points: 3 },
  ]
}

export const INITIAL_ASSESSMENT_QUESTIONS: readonly QuestionDefinition[] = [
  {
    id: "Q1",
    topic: "Thời gian chơi",
    text: "Bạn đã chơi cầu lông thường xuyên được bao lâu?",
    weight: 1,
    options: opts(
      "Tôi mới bắt đầu hoặc chơi chưa đến 3 tháng.",
      "Khoảng 3 tháng đến dưới 1 năm.",
      "Khoảng 1 đến dưới 3 năm.",
      "Từ 3 năm trở lên."
    ),
    internalNote:
      "Đánh giá kinh nghiệm tiếp xúc với môn chơi. Đây là câu kiểm tra giả định chơi lâu là giỏi: thời gian không bảo đảm kỹ năng, nên chỉ dùng trọng số 1 và không được kết luận trình độ chỉ từ câu này.",
  },
  {
    id: "Q2",
    topic: "Duy trì pha cầu",
    text: "Khi đánh cầu qua lại với người có trình độ tương đương, bạn thường duy trì được bao nhiêu lượt chạm cầu liên tiếp?",
    description:
      "Tính số lượt chạm cầu của cả hai người trong một pha cầu thông thường.",
    weight: 2,
    options: opts(
      "Dưới 3 lượt.",
      "Khoảng 3–5 lượt.",
      "Khoảng 6–10 lượt.",
      "Trên 10 lượt và tôi có thể chủ động thay đổi hướng hoặc độ dài đường cầu."
    ),
    internalNote:
      "Đánh giá khả năng duy trì pha cầu và kiểm soát cơ bản. Trọng số 2 vì đây là chỉ báo hữu ích nhưng còn phụ thuộc người đánh cùng và điều kiện chơi.",
  },
  {
    id: "Q3",
    topic: "Giao cầu",
    text: "Khi giao 10 quả cầu trong điều kiện bình thường, bạn thường giao hợp lệ được bao nhiêu quả?",
    weight: 2,
    options: opts(
      "Dưới 5 quả, hoặc tôi chưa chắc mình giao đúng ô.",
      "Khoảng 5–6 quả.",
      "Khoảng 7–8 quả và có thể chủ động giao ngắn hoặc giao dài.",
      "Khoảng 9–10 quả và thường đưa cầu đến vị trí mong muốn."
    ),
    internalNote:
      "Đánh giá độ ổn định và khả năng điều khiển giao cầu. Trọng số 2 vì hữu ích cho đánh đôi, nhưng kết quả tự ước lượng không thay thế kiểm tra thực tế.",
  },
  {
    id: "Q4",
    topic: "Xử lý cầu cuối sân",
    text: "Khi đối phương đánh cầu về cuối sân, bạn thường xử lý thế nào?",
    weight: 3,
    options: opts(
      "Tôi thường không kịp di chuyển hoặc đánh trượt.",
      "Tôi đánh trả được một số quả nhưng cầu thường ngắn, bổng hoặc ra ngoài.",
      "Tôi thường đánh trả qua lưới và có thể đưa cầu về gần cuối sân đối phương.",
      "Tôi thường di chuyển kịp và có thể lựa chọn đánh cầu cao sâu, bỏ nhỏ hoặc tấn công."
    ),
    internalNote:
      "Đánh giá khả năng di chuyển và xử lý cầu cuối sân. Trọng số 3 do phản ánh trực tiếp khả năng thực hiện kỹ thuật và lựa chọn phương án trong pha cầu.",
  },
  {
    id: "Q5",
    topic: "Phối hợp đánh đôi",
    text: "Khi chơi đánh đôi, bạn phối hợp với đồng đội như thế nào?",
    weight: 3,
    options: opts(
      "Tôi thường đứng một vị trí và chưa rõ khi nào nên tiến lên hoặc lùi xuống.",
      "Tôi biết di chuyển theo cầu nhưng đôi khi đứng trùng vị trí với đồng đội hoặc để trống sân.",
      "Tôi thường biết đứng trước–sau khi tấn công và đứng ngang khi phòng thủ.",
      "Tôi chủ động xoay chuyển vị trí, hỗ trợ đồng đội và thay đổi đội hình theo tình huống."
    ),
    internalNote:
      "Đánh giá phối hợp và vị trí trong đánh đôi. Trọng số 3 vì hệ thống khởi tạo điểm dành cho đánh đôi; biết mô tả lý thuyết không bảo đảm thực hiện được trên sân.",
  },
  {
    id: "Q6",
    topic: "Phòng thủ",
    text: "Khi đối phương đập cầu mạnh, bạn thường xử lý thế nào?",
    weight: 3,
    options: opts(
      "Tôi thường không kịp phản ứng hoặc không đỡ được.",
      "Tôi đỡ được một số quả và chủ yếu cố gắng đưa cầu qua lưới.",
      "Tôi thường đỡ được và cố gắng đưa cầu đến vị trí khó cho đối phương.",
      "Tôi có thể lựa chọn đỡ ngắn, đẩy ngang hoặc nâng cầu sâu tùy tình huống."
    ),
    internalNote:
      "Đánh giá phản ứng và lựa chọn đường cầu khi phòng thủ. Trọng số 3 vì là kỹ năng thực tế quan trọng trong đánh đôi; mức độ khó còn phụ thuộc sức đập của đối phương.",
  },
  {
    id: "Q7",
    topic: "Xử lý khi điểm sát nút",
    text: "Khi kết quả trận đấu đang sát nút, bạn thường làm gì?",
    weight: 1,
    options: opts(
      "Tôi cố gắng đánh thật mạnh để kết thúc pha cầu càng nhanh càng tốt.",
      "Tôi ưu tiên đưa cầu qua lưới, dù chưa chủ động chọn vị trí.",
      "Tôi cố gắng đánh chắc, hạn chế lỗi và đưa cầu vào khoảng trống.",
      "Tôi quan sát vị trí đối phương, phối hợp với đồng đội và lựa chọn phương án phù hợp với tình huống."
    ),
    internalNote:
      "Câu hỏi bẫy nhằm phát hiện quan niệm luôn đánh thật mạnh là tốt. Đánh giá tư duy tự nhận, không chứng minh được hành vi thực tế, nên chỉ dùng trọng số 1; không xem lựa chọn A là gian lận hoặc lỗi kỹ thuật tuyệt đối.",
  },
]

/** Câu hỏi/lựa chọn dạng công khai: không có note, điểm gốc hay trọng số. */
export interface PublicQuestion {
  id: string
  topic: string
  text: string
  description?: string
  options: { id: OptionId; text: string }[]
}

/** Bản trả cho người chơi, đúng thứ tự định nghĩa; cắt toàn bộ trường nội bộ. */
export function toPublicQuestions(
  questions: readonly QuestionDefinition[] = INITIAL_ASSESSMENT_QUESTIONS
): PublicQuestion[] {
  return questions.map((q) => ({
    id: q.id,
    topic: q.topic,
    text: q.text,
    ...(q.description ? { description: q.description } : {}),
    options: q.options.map((o) => ({ id: o.id, text: o.text })),
  }))
}
