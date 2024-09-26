import type { Response } from "express";

export function successResponse(
  res: Response,
  data: any,
  message: string = "success"
) {
  return res.status(200).json({
    status: "success",
    message,
    data,
  });
}

export function errorResponse(
  res: Response,
  statusCode: number,
  error: string
) {
  return res.status(statusCode).json({
    status: "error",
    error,
  });
}
