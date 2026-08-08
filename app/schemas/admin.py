from pydantic import BaseModel


class UserListItem(BaseModel):
    id: int
    username: str
    role: str
    created_at: str


class UserListResponse(BaseModel):
    users: list[UserListItem]


class DocumentItem(BaseModel):
    id: int
    filename: str
    file_type: str
    chunk_count: int
    created_at: str


class DocumentListResponse(BaseModel):
    documents: list[DocumentItem]


class UploadResponse(BaseModel):
    document_id: int
    filename: str
    chunk_count: int
    message: str
