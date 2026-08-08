from pydantic import BaseModel, Field, model_validator


class RegisterRequest(BaseModel):
    email: str | None = Field(default=None, examples=["traveler@example.com"])
    phone: str | None = Field(default=None, examples=["13800138000"])
    username: str = Field(min_length=2, max_length=64, examples=["traveler01"])
    password: str = Field(min_length=6, max_length=128, examples=["myPass123"])

    @model_validator(mode="after")
    def check_one(self):
        if not self.email and not self.phone:
            raise ValueError("邮箱和手机号至少填一个")
        return self
