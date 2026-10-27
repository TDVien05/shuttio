import { Body, Controller, Get, HttpCode, Param, Post } from "@nestjs/common"

import { UserId } from "../../common/user-id.decorator.js"
import { EloUserIdParamDto } from "./elo.dto.js"
import { EloService } from "./elo.service.js"

// Payload gửi bảng hỏi, cố ý khai báo bằng interface (không phải class DTO): với
// `ValidationPipe({ whitelist: true })`, một class thiếu decorator sẽ bị xoá
// trường âm thầm, che mất lỗi "thừa/sai kiểu". Kiểm tra chi tiết (đủ Q1–Q7,
// không trùng, đáp án A–D, từng mục đúng hai khoá) làm trong
// scoring.validateAnswers, nơi từ chối 400 thay vì lược bỏ.
interface InitialAssessmentBody {
  version?: unknown
  answers?: unknown
}

// Elo của người chơi (đánh đôi). Mọi route cần phiên Clerk hợp lệ (guard toàn
// cục); user luôn lấy từ phiên qua @UserId(), không bao giờ từ body.
@Controller("elo")
export class EloController {
  constructor(private readonly elo: EloService) {}

  /** Bộ câu hỏi công khai + version (không note/điểm/trọng số). */
  @Get("initial-assessment")
  getQuestions() {
    return this.elo.getPublicAssessment()
  }

  /** Kết quả hiện có, hoặc `initialized: false` nếu chưa khởi tạo. */
  @Get("initial-assessment/result")
  result(@UserId() userId: string) {
    return this.elo.getResult(userId)
  }

  /** Chỉ trả cờ cảnh báo để UI hiển thị trước khi xác nhận; không ghi gì. */
  @Post("initial-assessment/preview")
  @HttpCode(200)
  preview(@Body() body: InitialAssessmentBody) {
    return this.elo.previewWarning(body?.version, body?.answers)
  }

  /** Gửi bảng hỏi; idempotent với cùng payload, 409 với payload khác. */
  @Post("initial-assessment")
  @HttpCode(200)
  submit(@UserId() userId: string, @Body() body: InitialAssessmentBody) {
    return this.elo.submitAssessment(userId, body?.version, body?.answers)
  }

  /** Bỏ qua: cấp Elo mặc định 1000 (DEFAULT). */
  @Post("initial-assessment/skip")
  @HttpCode(200)
  skip(@UserId() userId: string) {
    return this.elo.skipAssessment(userId)
  }

  /** Trình độ công khai của một người chơi khác — hiện trên hồ sơ của họ. */
  @Get("users/:userId/level")
  publicLevel(@Param() param: EloUserIdParamDto) {
    return this.elo.getPublicLevels(param.userId)
  }
}
