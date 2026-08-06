package com.clinic.demo.controller.dto.output;

public record ApiResponse (
        boolean success,
        String message
){

}
